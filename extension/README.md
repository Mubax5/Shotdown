# Shotdown browser extension

The extension directory is intentionally dependency-free. Load this folder directly as an unpacked Chromium extension.

## First install

- Chrome: open `chrome://extensions/`
- Edge: open `edge://extensions/`
- enable Developer mode
- choose **Load unpacked**
- select this `extension` directory

## Capture model

Shotdown injects its selector only after the toolbar action is invoked. The user picks the scrollable container explicitly. The capture loop uses `chrome.tabs.captureVisibleTab`, crops to the chosen rectangle, and scrolls only the selected DOM element.

The overlay is hidden for each actual browser screenshot, so Shotdown controls do not appear in the result.

## Dynamic content handling

Full mode warms the selected container upward until its top content and scroll geometry remain stable across repeated passes. The downward capture loop recalculates scroll limits and performs stable-bottom waits rather than stopping on the first stalled scroll.

## Seam handling

Adjacent frames deliberately overlap. Shotdown compares sampled RGB pixels across candidate overlaps near the measured scroll delta. Low-confidence seams are recaptured after an additional layout stabilization wait.

## Export

Captured strips are streamed into A4 raster pages instead of constructing one giant canvas. This avoids browser maximum-canvas-height failures on very long chats.

Pages are JPEG-compressed and embedded directly in a small PDF writer. The optimizer tries two PDFs first, then three, while checking the final byte length of every generated PDF.
