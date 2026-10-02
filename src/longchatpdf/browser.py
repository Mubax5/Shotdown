from __future__ import annotations

import queue
import shutil
import threading
import time
import traceback
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image
from playwright.sync_api import BrowserContext, ElementHandle, Page, Playwright, sync_playwright

from .models import CaptureConfig
from .paths import PROFILE_DIR, WORK_DIR, ensure_dirs


@dataclass
class CaptureArtifacts:
    session_dir: Path
    strip_paths: list[Path]
    header_path: Path | None
    warning_messages: list[str]


class CancelledError(RuntimeError):
    pass


def _require_not_cancelled(cancel: threading.Event) -> None:
    if cancel.is_set():
        raise CancelledError("Operation cancelled")


def _wait_visible_media(page: Page, scroller: ElementHandle, timeout_ms: int) -> None:
    if timeout_ms <= 0:
        return
    deadline = time.time() + timeout_ms / 1000.0
    while time.time() < deadline:
        try:
            ready = scroller.evaluate(
                """
                el => {
                    const r = el.getBoundingClientRect();
                    const imgs = [...el.querySelectorAll('img')].filter(img => {
                        const b = img.getBoundingClientRect();
                        return b.bottom >= r.top && b.top <= r.bottom;
                    });
                    return imgs.every(img => img.complete && img.naturalWidth > 0);
                }
                """
            )
            if ready:
                return
        except Exception:
            return
        page.wait_for_timeout(100)


def _find_scroller(page: Page, selector_override: str = "") -> ElementHandle:
    if selector_override.strip():
        el = page.query_selector(selector_override.strip())
        if not el:
            raise RuntimeError(f"Custom selector did not match anything: {selector_override}")
        return el

    handle = page.evaluate_handle(
        """
        () => {
            const root = document.querySelector('#main') || document.body;
            const all = [root, ...root.querySelectorAll('*')];
            const candidates = all.filter(el => {
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return (
                    r.width >= 360 &&
                    r.height >= 280 &&
                    r.right > innerWidth * 0.58 &&
                    el.scrollHeight > el.clientHeight + 120 &&
                    ['auto', 'scroll'].includes(s.overflowY)
                );
            });
            candidates.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                const aMain = a.closest('#main') ? 1 : 0;
                const bMain = b.closest('#main') ? 1 : 0;
                return (bMain * 1e9 + rb.width * rb.height) - (aMain * 1e9 + ra.width * ra.height);
            });
            return candidates[0] || null;
        }
        """
    )
    el = handle.as_element()
    if not el:
        raise RuntimeError(
            "Could not detect the WhatsApp message scroll area. Open one conversation first, then try again."
        )
    return el


def _metrics(scroller: ElementHandle) -> dict:
    return scroller.evaluate(
        """
        el => ({
            top: Number(el.scrollTop || 0),
            height: Number(el.scrollHeight || 0),
            client: Number(el.clientHeight || 0),
            width: Number(el.clientWidth || 0),
            textStart: (el.innerText || '').slice(0, 450)
        })
        """
    )


def _capture_header(page: Page, path: Path) -> Path | None:
    for selector in ("#main header", "header[data-testid]", "#main > header"):
        try:
            loc = page.locator(selector).first
            if loc.count() and loc.is_visible():
                loc.screenshot(path=str(path), animations="disabled")
                return path
        except Exception:
            pass
    return None


def _load_history_to_top(
    page: Page,
    scroller: ElementHandle,
    cfg: CaptureConfig,
    cancel: threading.Event,
    progress: Callable[[float, str], None],
) -> list[str]:
    warnings = []
    if cfg.mode != "full":
        return warnings

    start = time.time()
    stable = 0
    previous_height = -1
    previous_start = ""
    rounds = 0

    progress(0.03, "Loading older messages...")
    while True:
        _require_not_cancelled(cancel)

        if time.time() - start > cfg.history_timeout_s:
            warnings.append(
                f"History loading stopped after {cfg.history_timeout_s}s. "
                "The capture contains everything WhatsApp loaded by then."
            )
            break

        try:
            scroller.evaluate("el => { el.scrollTop = 0; }")
        except Exception:
            scroller = _find_scroller(page, cfg.selector_override)
            scroller.evaluate("el => { el.scrollTop = 0; }")

        page.wait_for_timeout(max(350, cfg.scroll_delay_ms))
        m = _metrics(scroller)
        rounds += 1

        same = (
            m["top"] <= 3 and
            m["height"] == previous_height and
            m["textStart"] == previous_start
        )
        stable = stable + 1 if same else 0
        previous_height = m["height"]
        previous_start = m["textStart"]

        elapsed = time.time() - start
        p = min(0.22, 0.03 + elapsed / max(1, cfg.history_timeout_s) * 0.19)
        progress(p, f"Loading history... {rounds} passes")

        if stable >= cfg.stable_rounds:
            break

    scroller.evaluate("el => { el.scrollTop = 0; }")
    page.wait_for_timeout(700)
    return warnings


def _crop_new_content(prev: Image.Image, current: Image.Image, fallback_new_px: int) -> Image.Image:
    prev = prev.convert("RGB")
    current = current.convert("RGB")
    h = min(prev.height, current.height)

    if h < 120:
        return current.copy()

    max_overlap = min(360, int(h * 0.55))
    min_overlap = min(70, max_overlap)

    if max_overlap <= min_overlap:
        crop_top = max(0, current.height - fallback_new_px)
        return current.crop((0, crop_top, current.width, current.height))

    x0 = int(prev.width * 0.08)
    x1 = int(prev.width * 0.92)
    target_w = 160
    band_w = max(1, x1 - x0)
    factor = target_w / band_w

    def prep_full(img: Image.Image) -> np.ndarray:
        band = img.crop((x0, 0, x1, img.height)).convert("L")
        target_h = max(2, int(round(img.height * factor)))
        return np.asarray(
            band.resize((target_w, target_h), Image.Resampling.BILINEAR),
            dtype=np.float32,
        )

    a_full = prep_full(prev)
    b_full = prep_full(current)
    best_overlap = None
    best_score = float("inf")
    best_raw_score = float("inf")
    expected_overlap = max(0, current.height - fallback_new_px)

    for overlap in range(min_overlap, max_overlap + 1, 10):
        oh = max(2, int(round(overlap * factor)))
        oh = min(oh, a_full.shape[0], b_full.shape[0])
        if oh <= 1:
            continue

        a = a_full[-oh:]
        b = b_full[:oh]
        raw_score = float(np.mean(np.abs(a - b)))
        score = raw_score + abs(overlap - expected_overlap) * 0.045

        if score < best_score:
            best_score = score
            best_raw_score = raw_score
            best_overlap = overlap

    if best_overlap is not None and best_raw_score < 16.0:
        return current.crop((0, best_overlap, current.width, current.height))

    crop_top = max(0, current.height - fallback_new_px)
    return current.crop((0, crop_top, current.width, current.height))


def capture_chat(
    page: Page,
    cfg: CaptureConfig,
    cancel: threading.Event,
    progress: Callable[[float, str], None],
) -> CaptureArtifacts:
    ensure_dirs()

    session_dir = WORK_DIR / f"capture_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    if session_dir.exists():
        shutil.rmtree(session_dir)
    (session_dir / "strips").mkdir(parents=True, exist_ok=True)

    scroller = _find_scroller(page, cfg.selector_override)
    warnings = _load_history_to_top(page, scroller, cfg, cancel, progress)
    scroller = _find_scroller(page, cfg.selector_override)

    header_path = None
    if cfg.include_chat_header:
        header_path = _capture_header(page, session_dir / "chat_header.png")

    m = _metrics(scroller)

    if cfg.mode == "full":
        scroller.evaluate("el => { el.scrollTop = 0; }")
        page.wait_for_timeout(500)
        m = _metrics(scroller)

    if m["client"] <= 0 or m["height"] <= 0:
        raise RuntimeError("Detected scroll area has invalid dimensions")

    strips = []
    previous_frame = None
    initial_height = float(m["height"])
    dynamic_warned = False
    index = 0

    while True:
        _require_not_cancelled(cancel)

        scroller = _find_scroller(page, cfg.selector_override)
        _wait_visible_media(page, scroller, cfg.media_wait_ms)
        m = _metrics(scroller)

        current_top = float(m["top"])
        max_scroll = max(0.0, float(m["height"] - m["client"]))

        raw = scroller.screenshot(animations="disabled")
        frame = Image.open(BytesIO(raw)).convert("RGB")

        if previous_frame is None:
            strip = frame.copy()
        else:
            delta_css = max(1.0, current_top - prev_top)
            ratio = frame.height / max(1.0, float(m["client"]))
            fallback_new_px = max(1, min(frame.height, int(round(delta_css * ratio))))
            strip = _crop_new_content(previous_frame, frame, fallback_new_px)

        strip_path = session_dir / "strips" / f"strip_{index:05d}.png"
        strip.save(strip_path, optimize=True)
        strip.close()
        strips.append(strip_path)

        if previous_frame is not None:
            previous_frame.close()

        previous_frame = frame
        prev_top = current_top
        index += 1

        pct = 1.0 if max_scroll <= 1 else current_top / max_scroll
        progress(0.25 + pct * 0.48, f"Capturing chat... {pct * 100:5.1f}%")

        if abs(float(m["height"]) - initial_height) > 80 and not dynamic_warned:
            warnings.append(
                "The conversation height changed during capture. "
                "Visually review the seams before submission."
            )
            dynamic_warned = True

        if current_top >= max_scroll - 3:
            break

        step = max(160, int(float(m["client"]) - cfg.overlap_px))
        target = min(max_scroll, current_top + step)

        scroller.evaluate("(el, pos) => { el.scrollTop = pos; }", target)
        page.wait_for_timeout(cfg.scroll_delay_ms)

        new_m = _metrics(scroller)
        if float(new_m["top"]) <= current_top + 0.5:
            warnings.append("Capture stopped because the chat pane would not scroll further.")
            break

    if previous_frame is not None:
        previous_frame.close()

    return CaptureArtifacts(session_dir, strips, header_path, warnings)


class BrowserWorker:
    def __init__(self):
        ensure_dirs()
        self.commands = queue.Queue()
        self.events = queue.Queue()
        self.cancel_event = threading.Event()
        self.thread = threading.Thread(target=self._run, name="browser-worker", daemon=True)
        self.thread.start()

    def send(self, name: str, payload=None) -> None:
        self.commands.put((name, payload))

    def cancel(self) -> None:
        self.cancel_event.set()

    def _emit(self, kind: str, payload=None) -> None:
        self.events.put((kind, payload))

    def _run(self) -> None:
        pw: Playwright | None = None
        context: BrowserContext | None = None
        page: Page | None = None

        try:
            pw = sync_playwright().start()

            while True:
                name, payload = self.commands.get()

                if name == "quit":
                    break

                try:
                    if name == "open":
                        cfg: CaptureConfig = payload

                        if context is None:
                            launch_errors = []

                            for channel in ("msedge", "chrome", None):
                                try:
                                    kwargs = dict(
                                        user_data_dir=str(PROFILE_DIR),
                                        headless=False,
                                        viewport={
                                            "width": cfg.viewport_width,
                                            "height": cfg.viewport_height,
                                        },
                                        locale="en-US",
                                    )

                                    if channel is not None:
                                        kwargs["channel"] = channel

                                    context = pw.chromium.launch_persistent_context(**kwargs)
                                    break
                                except Exception as exc:
                                    launch_errors.append(f"{channel or 'bundled chromium'}: {exc}")

                            if context is None:
                                raise RuntimeError(
                                    "Could not start Edge, Chrome, or Playwright Chromium. "
                                    "Run setup_windows.bat to install the fallback browser.\n\n"
                                    + "\n\n".join(launch_errors[-2:])
                                )

                            page = context.pages[0] if context.pages else context.new_page()

                        assert page is not None
                        page.goto(
                            "https://web.whatsapp.com",
                            wait_until="domcontentloaded",
                            timeout=90_000,
                        )
                        self._emit("opened")

                    elif name == "analyze":
                        if page is None:
                            raise RuntimeError("Open WhatsApp Web first")

                        cfg: CaptureConfig = payload
                        el = _find_scroller(page, cfg.selector_override)
                        self._emit("analyzed", _metrics(el))

                    elif name == "capture":
                        if page is None:
                            raise RuntimeError("Open WhatsApp Web first")

                        cfg: CaptureConfig = payload
                        self.cancel_event.clear()

                        artifacts = capture_chat(
                            page,
                            cfg,
                            self.cancel_event,
                            lambda p, msg: self._emit("progress", (p, msg)),
                        )
                        self._emit("captured", artifacts)

                    else:
                        raise RuntimeError(f"Unknown worker command: {name}")

                except CancelledError as exc:
                    self._emit("cancelled", str(exc))
                except Exception as exc:
                    self._emit("error", f"{exc}\n\n{traceback.format_exc()}")

        finally:
            try:
                if context is not None:
                    context.close()
            except Exception:
                pass

            try:
                if pw is not None:
                    pw.stop()
            except Exception:
                pass
