# Shotdown capture algorithm

## 1. Target selection

The content script walks upward from the hovered DOM element until it finds a visible vertical scroll container. The user explicitly locks that container. Nested layouts can be moved to the next scrollable parent with **Parent**.

## 2. Crop

Crop coordinates are stored relative to the selected target, not the whole page. The same crop is therefore used throughout the scroll capture.

## 3. Pre-capture history warm-up

Full mode repeatedly moves the target to the top. A pass waits for DOM mutations, scroll geometry and content fingerprints to settle. The history is considered ready only after multiple unchanged passes and a minimum quiet time.

## 4. Screenshot safety

The service worker serializes visible-tab screenshots and enforces a minimum interval. It verifies that the requesting tab is still active immediately before capture.

The overlay is hidden during the actual screenshot.

## 5. Fixed-band detection

After the first scroll movement, the first two frames are compared at the same screen coordinates. Consecutive low-difference rows at the top/bottom are treated as conservative sticky-band candidates.

The header band is emitted once before the scrolling body. The footer band is emitted once after the scrolling body.

## 6. Seam matching

The actual scroll delta gives the expected overlap.

Around that expected overlap, Shotdown performs a coarse-to-fine visual search. The score combines RGB difference with horizontal edge difference. Low-detail wallpaper receives less weight than high-detail message/text edges.

A match must also pass an ambiguity check. If confidence is low, Shotdown waits again and recaptures. Persistent ambiguity uses the measured overlap instead of an arbitrary visual match.

## 7. Dynamic bottom handling

Reaching the current `scrollHeight - clientHeight` is not enough to stop. Shotdown waits for possible height growth and requires repeated stable bottom checks before ending.

## 8. Streaming pagination

New stitched content is appended directly into A4 page canvases. When a page fills, it is encoded as a PNG blob and the canvas memory is released.

This avoids creating one enormous long screenshot canvas.

## 9. PDF optimization

Page blobs are decoded one at a time and encoded to JPEG at candidate scale/quality settings.

Profiles are tried in this order:

1. 2 PDFs, normal readability floor;
2. 3 PDFs, normal readability floor;
3. 3 PDFs, aggressive fallback.

Page ranges are balanced with a minimax partitioner. Each produced PDF is built and its actual byte length is checked against the configured cap.
