# Shotdown browser extension

The `extension` folder can be loaded directly as an unpacked Chrome/Edge extension.

## Files

- `core.js` — tested pure seam/PDF/partition algorithms.
- `content.js` — selector, crop UI, lazy loading, capture loop, page streaming.
- `service-worker.js` — active-tab validation, screenshot throttling, downloads.
- `tests/core.test.cjs` — Node smoke tests for core algorithms.

## Reliability model

### Screenshot throttle

`captureVisibleTab` is serialized per browser window and rate-limited. This prevents long captures from intermittently failing because screenshot requests arrive too quickly.

### Active-tab guard

Before every screenshot the service worker verifies that the requesting tab is still the active tab in its window.

### Lazy content

Full mode repeatedly reaches the top and requires several stable passes across geometry and content fingerprints. Downward capture also waits for bottom growth instead of stopping on the first stall.

### Seam matching

The shared core scores candidate overlaps using both color difference and edge structure. Low-detail wallpaper contributes less weight than text/bubble edges. Ambiguous matches fall back to the measured scroll delta.

### Fixed bands

Stable top/bottom bands are detected conservatively from the first moving frame pair. They are kept once instead of repeated on every page.

### Memory

Capture frames are immediately stitched into A4 page canvases. Finished pages are converted to PNG blobs and the large canvas is released. PDF optimization then works from those page blobs.

## Tests

```powershell
node --check core.js
node --check content.js
node --check service-worker.js
node tests\core.test.cjs
```
