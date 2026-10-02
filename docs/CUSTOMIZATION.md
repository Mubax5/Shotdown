# Customization

Shotdown separates capture, pagination, export, and UI logic so changes stay focused.

- `src/longchatpdf/browser.py` — WhatsApp detection, history loading, capture, overlap handling.
- `src/longchatpdf/paginate.py` — captured strips to page rasters.
- `src/longchatpdf/pdf_export.py` — adaptive compression, partitioning, hard-cap checks.
- `src/longchatpdf/pipeline.py` — capture-to-PDF orchestration.
- `src/longchatpdf/ui.py` — light/dark desktop UI.
- `src/longchatpdf/models.py` — persisted capture/export/theme settings.

When changing WhatsApp selectors, keep the auto-detection heuristic and a manual fallback. When changing compression, preserve the final byte-size verification.
