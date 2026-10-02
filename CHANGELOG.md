# Changelog

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
- Added extension syntax checks in GitHub Actions.

## 0.2.0 — 2026-10-02

- Renamed the public product to **Shotdown**.
- Rebuilt the desktop interface with a restrained, neutral visual system.
- Added white-dominant light mode and dark-gray dark mode.
- Added persistent theme preference.
- Added CI tests and Windows build automation.

## 0.1.0

- Initial long-chat desktop capture pipeline.
