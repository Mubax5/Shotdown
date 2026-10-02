from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from PIL import Image, ImageStat


def _auto_background(image: Image.Image) -> tuple[int, int, int]:
    img = image.convert("RGB")
    w, h = img.size
    crop = img.crop((0, 0, min(w, 40), min(h, 40)))
    mean = ImageStat.Stat(crop).mean
    return tuple(int(v) for v in mean[:3])


def build_page_images(
    strip_paths: Iterable[Path],
    out_dir: Path,
    usable_ratio: float,
    header_path: Path | None = None,
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    strips = [Path(p) for p in strip_paths]
    if not strips:
        raise ValueError("No captured strips to paginate")

    first = Image.open(strips[0]).convert("RGB")
    width = first.width
    first.close()
    page_h = max(256, int(round(width * usable_ratio)))

    page_paths: list[Path] = []
    canvas: Image.Image | None = None
    y = 0
    page_idx = 0
    bg = None

    def new_canvas(seed: Image.Image | None = None) -> Image.Image:
        nonlocal bg
        if bg is None:
            bg = _auto_background(seed) if seed is not None else (255, 255, 255)
        return Image.new("RGB", (width, page_h), bg)

    def flush(force: bool = False) -> None:
        nonlocal canvas, y, page_idx
        if canvas is None or (y == 0 and not force):
            return
        crop_h = max(1, y)
        page = canvas.crop((0, 0, width, crop_h))
        path = out_dir / f"page_{page_idx:05d}.png"
        page.save(path, optimize=True)
        page.close()
        canvas.close()
        canvas = None
        y = 0
        page_idx += 1

    def append_image(img: Image.Image) -> None:
        nonlocal canvas, y
        src = img.convert("RGB")
        if src.width != width:
            new_h = max(1, int(round(src.height * width / src.width)))
            src = src.resize((width, new_h), Image.Resampling.LANCZOS)

        top = 0
        while top < src.height:
            if canvas is None:
                canvas = new_canvas(src)
            room = page_h - y
            take = min(room, src.height - top)
            segment = src.crop((0, top, width, top + take))
            canvas.paste(segment, (0, y))
            segment.close()
            y += take
            top += take
            if y >= page_h:
                flush()
        if src is not img:
            src.close()

    if header_path is not None and Path(header_path).exists():
        with Image.open(header_path) as header:
            append_image(header)

    for strip in strips:
        with Image.open(strip) as img:
            append_image(img)

    flush(force=True)
    return page_paths
