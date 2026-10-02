# Changelog

## 0.4.0 — 2026-10-02

- Added a throttled screenshot queue to stay below Chromium's visible-tab capture rate limit.
- Added active-tab verification before every browser screenshot so switching tabs cannot silently capture the wrong page.
- Added target-disconnect and visibility guards during long captures.
- Added DOM-mutation-aware layout settling and longer lazy-history stability checks.
- Hardened bottom detection so temporary stalls do not end a capture early.
- Replaced raw seam matching with edge-weighted visual matching and ambiguity detection.
- Added conservative fixed top/bottom bar detection. Stable headers are kept once at the beginning and stable footers once at the end instead of being duplicated on every frame.
- Changed capture assembly to stream into compressed A4 page sources instead of holding every screenshot strip in memory.
- Added balanced PDF partitioning and PDF metadata through a tested shared core.
- Reworked PDF optimization to use a readability floor, try 2 parts first, then 3, and verify final byte sizes.
- Added an on-screen Cancel button in addition to Esc.
- Added capture-time animation/transition freezing to reduce visual seams and caret flicker.
- Added hostname-aware output filenames.
- Added Node smoke tests for seam matching, fixed-band detection, partitioning, and PDF xref generation.
- Improved `run_extension.bat` to prefer the browser that is already running and accept `chrome` / `edge` arguments.
- Added `setup_github_metadata.bat` for setting the repository About description and topics through GitHub CLI.

## 0.3.0 — 2026-10-02

- Reworked Shotdown around a browser-extension-first workflow.
- Uses the user's existing Chrome/Edge session; no second WhatsApp login or Playwright profile.
- Added explicit scrollable-container selection for pages with multiple scroll regions.
- Added nested-scroll parent selection.
- Added snipping-style crop selection before a full capture.
- Added full-history warm-up with repeated stability checks for lazy-loaded/virtualized chats.
- Added resilient downward scrolling that waits for content growth instead of stopping on the first stall.
- Added visual overlap/seam matching with a stabilization retry and measured-scroll fallback.
- Added A4 PDF generation in-browser with adaptive 2→3 part size-capped export.
- Added `run_extension.bat` and `package_extension.bat`.

## 0.2.0 — 2026-10-02

- Renamed the public product to **Shotdown**.
- Rebuilt the desktop interface with a restrained, neutral visual system.
- Added white-dominant light mode and dark-gray dark mode.
- Added persistent theme preference.

## 0.1.0

- Initial long-chat desktop capture pipeline.
