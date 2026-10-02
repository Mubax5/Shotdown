# Capture and export algorithm

## 1. Detect the conversation scroller

Shotdown searches inside WhatsApp Web's main conversation area for a large vertically scrollable element. The heuristic prefers elements inside `#main`, with enough width/height and a meaningful `scrollHeight - clientHeight`.

A custom CSS selector is available as a fallback.

## 2. Load older messages

In Full mode, Shotdown repeatedly sets the chat scroller to the top and waits for WhatsApp to add older messages. Loading stops after several stable passes or after the configured timeout.

## 3. Capture viewports

Each visible viewport is captured directly from the conversation scroller. Shotdown scrolls by roughly one viewport minus an overlap band.

## 4. Remove overlap

The bottom of the previous screenshot is compared with the top of the current screenshot on downsampled grayscale pixels. A match near the expected scroll-distance overlap is preferred. If visual matching is unreliable, the known scroll delta is used as a fallback.

## 5. Paginate

Captured strips are packed into A4- or Letter-shaped raster pages without changing message order.

## 6. Compress and split

Shotdown first tries the requested number of parts. In Auto mode it tries two PDFs, then three. For each candidate it prioritizes resolution, then binary-searches JPEG quality.

## 7. Verify the hard cap

PDFs are rendered, then their actual byte sizes are checked. If ReportLab overhead pushes a PDF above the cap, Shotdown retries at a slightly lower JPEG quality.
