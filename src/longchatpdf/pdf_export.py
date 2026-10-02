from __future__ import annotations

import shutil
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from .models import ExportConfig


@dataclass
class ExportResult:
    pdf_paths: list[Path]
    part_page_ranges: list[tuple[int, int]]
    scale: float
    quality: int
    total_pages: int
    warnings: list[str]


@dataclass
class _Candidate:
    scale: float
    quality: int
    jpeg_paths: list[Path]
    jpeg_sizes: list[int]
    partitions: list[tuple[int, int]]


def _page_size(name: str):
    return LETTER if name.upper() == "LETTER" else A4


def _linear_partition(sizes: list[int], k: int) -> list[tuple[int, int]]:
    n = len(sizes)
    k = max(1, min(k, n))
    prefix = [0]
    for s in sizes:
        prefix.append(prefix[-1] + s)

    inf = 10**30
    dp = [[inf] * (k + 1) for _ in range(n + 1)]
    cut = [[0] * (k + 1) for _ in range(n + 1)]
    dp[0][0] = 0

    for i in range(1, n + 1):
        dp[i][1] = prefix[i]

    for parts in range(2, k + 1):
        for i in range(parts, n + 1):
            for j in range(parts - 1, i):
                cost = max(dp[j][parts - 1], prefix[i] - prefix[j])
                if cost < dp[i][parts]:
                    dp[i][parts] = cost
                    cut[i][parts] = j

    ranges = []
    i, parts = n, k
    while parts > 1:
        j = cut[i][parts]
        ranges.append((j, i))
        i = j
        parts -= 1
    ranges.append((0, i))
    ranges.reverse()
    return ranges


def _part_estimate(sizes, ranges):
    return [sum(sizes[a:b]) + 24_000 + (b-a)*2_500 for a, b in ranges]


def _compress_pages(page_paths, out_dir, scale, quality, grayscale):
    key_dir = out_dir / f"s{int(scale*1000):04d}_q{quality:02d}_{'g' if grayscale else 'c'}"
    if key_dir.exists():
        shutil.rmtree(key_dir)
    key_dir.mkdir(parents=True, exist_ok=True)

    paths, sizes = [], []
    for idx, path in enumerate(page_paths):
        with Image.open(path) as img:
            img = img.convert("RGB")
            if scale < 0.999:
                new_w = max(320, int(round(img.width * scale)))
                new_h = max(1, int(round(img.height * new_w / img.width)))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            if grayscale:
                img = ImageOps.grayscale(img).convert("RGB")
            out = key_dir / f"page_{idx:05d}.jpg"
            img.save(out, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=2)
        paths.append(out)
        sizes.append(out.stat().st_size)
    return paths, sizes


def _choose_parts(pref: str, max_files: int) -> list[int]:
    max_files = max(1, min(3, int(max_files)))
    if pref == "3":
        return [3] if max_files >= 3 else [max_files]
    if pref == "2":
        return [2, 3] if max_files >= 3 else [min(2, max_files)]
    choices = [p for p in (2, 3) if p <= max_files]
    return choices or [max_files]


def _find_candidate(page_paths, work_dir, cfg: ExportConfig) -> _Candidate:
    cap = int(cfg.max_mb_per_file * 1_000_000 * 0.965)
    scales = [1.00, .92, .85, .78, .72, .66, .60, .55, cfg.min_scale]
    scales = sorted({round(max(cfg.min_scale, min(1.0, s)), 3) for s in scales}, reverse=True)

    for parts in _choose_parts(cfg.part_preference, cfg.max_files):
        parts = min(parts, max(1, len(page_paths)))
        for scale in scales:
            lo, hi = int(cfg.min_quality), int(cfg.max_quality)
            best = None
            while lo <= hi:
                q = (lo + hi) // 2
                jpeg_paths, sizes = _compress_pages(page_paths, work_dir, scale, q, cfg.grayscale)
                ranges = _linear_partition(sizes, parts)
                if max(_part_estimate(sizes, ranges)) <= cap:
                    best = _Candidate(scale, q, jpeg_paths, sizes, ranges)
                    lo = q + 1
                else:
                    hi = q - 1
            if best is not None:
                return best

    raise RuntimeError(
        "The selected conversation cannot fit inside the configured PDF cap even at the minimum quality. "
        "Increase the file count/size limit, shorten the capture range, or enable grayscale."
    )


def _render_part(jpeg_paths, page_range, out_path, cfg, part_number, part_count):
    page_w, page_h = _page_size(cfg.page_size)
    margin = float(cfg.margin_pt)
    usable_w = page_w - 2 * margin
    usable_h = page_h - 2 * margin

    c = canvas.Canvas(str(out_path), pagesize=(page_w, page_h), pageCompression=1)
    c.setTitle(f"{cfg.output_prefix} - part {part_number} of {part_count}")
    c.setAuthor("Shotdown")
    c.setSubject("Captured chat evidence")

    start, end = page_range
    for absolute_idx in range(start, end):
        path = jpeg_paths[absolute_idx]
        with Image.open(path) as img:
            iw, ih = img.size
        scale = min(usable_w / iw, usable_h / ih)
        draw_w, draw_h = iw * scale, ih * scale
        x = (page_w - draw_w) / 2
        y = page_h - margin - draw_h
        c.drawImage(ImageReader(str(path)), x, y, width=draw_w, height=draw_h, preserveAspectRatio=True)

        if cfg.footer_page_numbers:
            c.setFont("Helvetica", 7)
            c.setFillGray(0.45)
            c.drawRightString(page_w - margin, 5.5, f"Page {absolute_idx + 1}")
            c.setFillGray(0)
        c.showPage()
    c.save()


def export_pdfs(page_paths: list[Path], work_dir: Path, cfg: ExportConfig) -> ExportResult:
    if not page_paths:
        raise ValueError("No pages to export")

    out_dir = Path(cfg.output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    warnings = []
    candidate = _find_candidate(page_paths, work_dir / "compressed", cfg)
    hard_cap = int(cfg.max_mb_per_file * 1_000_000)
    quality, scale = candidate.quality, candidate.scale

    output_stem = cfg.output_prefix
    expected_names = [
        out_dir / f"{output_stem}_part_{i:02d}-of-{len(candidate.partitions):02d}.pdf"
        for i in range(1, len(candidate.partitions) + 1)
    ]
    if any(p.exists() for p in expected_names):
        output_stem = f"{output_stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    for attempt in range(6):
        if attempt > 0:
            quality = max(cfg.min_quality, quality - 3)
            jpeg_paths, sizes = _compress_pages(
                page_paths, work_dir / "compressed_retry", scale, quality, cfg.grayscale
            )
            candidate = _Candidate(
                scale, quality, jpeg_paths, sizes,
                _linear_partition(sizes, len(candidate.partitions))
            )

        pdf_paths = []
        for idx, page_range in enumerate(candidate.partitions, start=1):
            path = out_dir / f"{output_stem}_part_{idx:02d}-of-{len(candidate.partitions):02d}.pdf"
            _render_part(candidate.jpeg_paths, page_range, path, cfg, idx, len(candidate.partitions))
            pdf_paths.append(path)

        if not [p for p in pdf_paths if p.stat().st_size > hard_cap]:
            if candidate.scale < .70 or candidate.quality < 52:
                warnings.append(
                    "The size limit required aggressive compression. Check small text at 100% zoom before submitting."
                )
            return ExportResult(
                pdf_paths,
                [(a + 1, b) for a, b in candidate.partitions],
                candidate.scale,
                candidate.quality,
                len(page_paths),
                warnings,
            )

        for p in pdf_paths:
            try:
                p.unlink()
            except OSError:
                pass

        if quality <= cfg.min_quality:
            break

    raise RuntimeError("Could not keep every generated PDF under the configured hard size limit.")
