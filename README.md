# Shotdown

**Capture very long WhatsApp Web conversations and turn them into compact, submission-ready PDF evidence.**

[![CI](https://github.com/Mubax5/Shotdown/actions/workflows/ci.yml/badge.svg)](https://github.com/Mubax5/Shotdown/actions/workflows/ci.yml)
[![Windows build](https://github.com/Mubax5/Shotdown/actions/workflows/windows-build.yml/badge.svg)](https://github.com/Mubax5/Shotdown/actions/workflows/windows-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-171717.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-171717.svg)](https://www.python.org/)

Shotdown is built for a specific failure mode: ordinary full-page screenshot tools often break on WhatsApp Web because the conversation lives inside its own scroll container and the message list is loaded and recycled dynamically. Shotdown scrolls the actual conversation pane, captures controlled viewport strips, removes overlap, paginates the result, then adaptively compresses it until every generated PDF respects the configured size cap.

> Shotdown is not affiliated with or endorsed by WhatsApp or Meta. It automates screen capture and PDF packaging; it does not independently establish the authenticity or legal admissibility of a conversation.

## Interface

The desktop UI is intentionally neutral and compact: white-dominant light mode, dark gray dark mode, no decorative gradients, and only the controls needed for capture and export.


## What it does

- Captures the actual WhatsApp Web conversation scroller instead of the browser page.
- Loads older messages before capture in **Full conversation** mode.
- Uses visual overlap matching plus scroll-distance fallback to reduce duplicated or missing seams.
- Can include the chat header once for contact/context information.
- Exports A4 or Letter PDFs.
- Tries **2 PDF files first**, then automatically uses **3** when required to preserve readability.
- Enforces a strict per-file size cap; the default is **3.00 MB = 3,000,000 bytes**.
- Adaptively adjusts JPEG quality and resolution while prioritizing readable text.
- Offers optional grayscale for difficult size limits.
- Keeps the browser session locally so WhatsApp Web usually stays signed in.
- Processes captures locally. No telemetry, no upload backend.
- Removes raw screenshots after a successful export by default.
- Includes a persistent light/dark theme and adjustable capture settings.

## Windows quick start

Requirements: **Windows 10/11** and **Python 3.10+**.

1. Download or clone this repository.
2. Run `setup_windows.bat` once.
3. Run `run_windows.bat`.
4. Click **Open WhatsApp** and sign in if needed.
5. Open the conversation you want to capture.
6. Click **Check** to verify the chat pane.
7. Click **Start capture**.

The default evidence profile is designed for portals that only allow a few uploads:

```text
PDF files       auto (2 first, then 3)
Max size        3.00 MB per file
Maximum files   3
Page size       A4
Color           on
```

## Why full-page screenshot extensions fail here

WhatsApp Web is not one tall, static page. Older messages are loaded while the conversation scrolls upward, and off-screen message elements may be recycled. A normal full-page extension can therefore stop early, repeat messages, leave gaps, or generate corrupted stripes.

Shotdown uses a different pipeline:

```text
open WhatsApp Web
      |
find the real message scroller
      |
load older history until stable
      |
capture visible viewport
      |
scroll only the conversation pane
      |
match and crop overlap
      |
repeat to the bottom
      |
paginate to A4 / Letter
      |
compress + split into 2 or 3 PDFs
      |
verify every PDF <= configured cap
```

See [docs/ALGORITHM.md](docs/ALGORITHM.md) for implementation details.

## Output

Typical two-part output:

```text
chat_evidence_part_01-of-02.pdf
chat_evidence_part_02-of-02.pdf
```

If two files would require too much compression, Shotdown can move to three parts:

```text
chat_evidence_part_01-of-03.pdf
chat_evidence_part_02-of-03.pdf
chat_evidence_part_03-of-03.pdf
```

The exporter checks the **actual final PDF byte size**, not only an estimate. If PDF overhead pushes a file beyond the cap, it retries with a slightly lower image quality.

## Capture modes

### Full conversation

Moves the conversation pane to the top repeatedly until WhatsApp stops adding older history, or until the configured history timeout is reached. It then captures from the oldest loaded message to the bottom.

### Current to bottom

Starts from the current scroll position and captures downward. Useful when only part of a very large conversation is relevant.

## Adjustable settings

**Export**

- output folder
- filename prefix
- auto / 2 / 3 PDF files
- maximum MB per file
- A4 / Letter page size
- grayscale
- keep or delete raw capture files

**Capture**

- full / current-to-bottom range
- custom CSS selector fallback
- overlap size
- scroll delay
- history timeout
- include chat header

Settings are stored locally at:

```text
%USERPROFILE%\.shotdown\settings.json
```

The persistent WhatsApp browser profile is stored under:

```text
%USERPROFILE%\.shotdown\browser_profile
```

Treat that browser profile as sensitive because it can contain an authenticated WhatsApp Web session.

## Development

```powershell
py -m venv .venv
.venv\Scripts\activate
python -m pip install -U pip
pip install -e .[dev]
python -m playwright install chromium
pytest -q
python -m longchatpdf
```

The public product name is **Shotdown**. The Python package remains `longchatpdf` internally for compatibility with the original capture pipeline.

```text
src/longchatpdf/
  browser.py       Playwright capture + history loading + seam handling
  paginate.py      captured strips -> page-shaped raster images
  pdf_export.py    adaptive compression + partitioning + hard-cap verification
  pipeline.py      capture -> pages -> PDFs
  ui.py            Shotdown desktop interface + light/dark themes
  config.py        persistent local settings
```

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) before changing capture/export behavior.

## Privacy and security

Shotdown has no telemetry and no upload service. The only network activity is the browser loading WhatsApp Web itself. Chat screenshots and generated PDFs are processed on the local machine.

Raw temporary captures can contain private messages. They are removed after a successful export unless **Keep raw capture files** is enabled. If an export fails, the work directory is retained for troubleshooting.

Please read [SECURITY.md](SECURITY.md) before sharing logs or bug reports.

## Known limitations

- WhatsApp can change its DOM at any time. Auto-detection is heuristic and a selector override is available as a fallback.
- Very large conversations can take several minutes to load and capture.
- Incoming messages or late-loading media can change scroll height during a run.
- A fixed storage budget has a physical limit. If an extremely long conversation cannot remain readable inside `3 × 3 MB`, reduce the capture range, enable grayscale, or increase the cap.
- Always inspect final PDFs at 100% zoom before submitting them.

## License

MIT. See [LICENSE](LICENSE).
