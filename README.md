# Shotdown

**Select the exact scrollable area you want, crop it like a snipping tool, and capture long dynamic content cleanly from your existing Chrome or Edge session.**

Shotdown is built for pages with multiple independent scroll regions: WhatsApp Web, dashboards, web apps, chat interfaces, feeds, panels, and nested scroll containers. It does not open a second browser profile and does not require another login.

## Why Shotdown

Ordinary full-page screenshot tools often fail on modern web apps because they:

- scroll the wrong container;
- stop when lazy-loaded content has not finished loading;
- duplicate or skip rows when a virtualized list re-renders;
- repeat sticky headers/composers on every frame;
- exceed browser canvas limits on very long captures.

Shotdown handles those cases explicitly.

## Workflow

1. Open the page in the browser session you already use.
2. Click **Shotdown** or press **Alt + Shift + S**.
3. Hover the target scrollable region.
4. Click to lock it.
5. Use **Parent** when the page has nested scroll containers.
6. Optional: click **Crop** and drag the exact region to keep.
7. Choose:
   - **Full / load to top** for complete history;
   - **Current to bottom** to start from the current position.
8. Click **Capture PDF**.

Keep the target tab active while capture is running.

## Clean stitching

Shotdown v0.4 uses multiple layers of protection instead of blindly pasting screenshots:

- captures the actual measured scroll delta;
- waits for DOM/layout stability and visible images;
- throttles browser screenshots to stay within Chromium limits;
- compares image edges and color information across overlapping frames;
- rejects ambiguous visual seams and falls back to the measured scroll distance;
- retries difficult seams after an extra stabilization wait;
- pauses CSS animations/transitions during capture;
- restores the original scroll position afterward.

### Fixed headers and footers

Shotdown compares the first moving frames and conservatively detects stable top/bottom bands.

If a sticky header or composer is truly stationary:

- the top band is kept once at the beginning;
- the bottom band is kept once at the end;
- it is not duplicated between every stitched frame.

Manual Crop is still available when you want exact control.

## Lazy-loaded / virtualized history

**Full / load to top** does not treat the first `scrollTop = 0` as the real beginning.

Shotdown repeatedly:

- reaches the top;
- waits for DOM mutations and layout changes to settle;
- checks scroll geometry, child structure, and content fingerprints;
- requires repeated stable passes before starting capture.

During the downward pass it also recalculates the current bottom continuously. A temporary stall is retried and lazy-loaded growth is given time to appear before Shotdown decides the capture is complete.

## Memory-safe long captures

Shotdown does not build one enormous long canvas.

Stitched content is streamed into A4 page sources as capture progresses. Completed pages are compressed to local PNG blobs and the large frame canvases are released, reducing the chance of tab crashes on very long conversations.

## PDF output

Default evidence profile:

- tries **2 PDFs first**;
- falls back to **3 PDFs** when needed;
- default hard cap: **3,000,000 bytes per PDF**;
- A4 pages;
- adaptive quality/resolution;
- final PDF byte sizes are verified before download;
- files go to `Downloads/Shotdown/`.

The optimizer keeps a readability floor before switching to the more aggressive compression profile.

## Safety against wrong-tab captures

Chromium's screenshot API captures the active visible tab. Shotdown verifies the requesting tab before **every screenshot**.

If you switch tabs or hide the target during capture, Shotdown stops with an error instead of silently capturing the wrong page.

## Install / run on Windows

Double-click:

```text
run_extension.bat
```

It opens the extension folder and the extension manager for the browser already running when possible.

First install only:

1. Enable **Developer mode**.
2. Click **Load unpacked**.
3. Select the `extension` folder.
4. Pin Shotdown.

Optional:

```text
run_extension.bat chrome
run_extension.bat edge
```

No Node, Python, Playwright, or second browser login is required for the extension.

## Package

To create a ZIP:

```text
package_extension.bat
```

## Repository metadata

If the GitHub About description/topics are empty and GitHub CLI is installed:

```text
setup_github_metadata.bat
```

## Development

```powershell
node --check extension\core.js
node --check extension\content.js
node --check extension\service-worker.js
node extension\tests\core.test.cjs
```

GitHub Actions runs these checks automatically.

## Structure

```text
extension/
  manifest.json
  core.js
  content.js
  service-worker.js
  tests/core.test.cjs

run_extension.bat
package_extension.bat
setup_github_metadata.bat

src/longchatpdf/
  ... legacy desktop fallback ...
```

## Privacy

Shotdown processes capture data locally in the browser.

- no telemetry;
- no cloud upload;
- no copied browser profile;
- no separate WhatsApp session;
- no remote screenshot backend.

Permissions are limited to `activeTab`, `scripting`, and `downloads`.

## Limitations

Shotdown cannot run on browser-protected pages such as `chrome://`, `edge://`, or browser extension stores. Cross-origin iframe internals may also be unavailable for direct DOM selection.

For evidence use, review the final PDFs once before submitting them, especially if Shotdown reports seam fallbacks.

## License

MIT. Shotdown is not affiliated with or endorsed by WhatsApp or Meta.
