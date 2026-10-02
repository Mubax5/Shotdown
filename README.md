# Shotdown

**Pick any scrollable area in Chrome or Edge, optionally crop it, and capture the full content cleanly — without opening a second browser session.**

Shotdown is a local browser extension for pages that contain multiple independent scroll regions. Instead of guessing which scrollbar to move, it lets you point at the exact scrollable container you want, lock it, crop the visible region like a snipping tool, and then capture that region from top to bottom.

It was designed around difficult interfaces such as WhatsApp Web, where the chat and sidebar are separate scrollable components and older messages may load only after repeatedly reaching the top.

## The workflow

1. Open the page in the Chrome/Edge session you already use.
2. Click the **Shotdown** extension icon.
3. Hover the scrollable region you want. Shotdown outlines the nearest scrollable container.
4. Click to lock it. Use **Parent** if the page has nested scroll containers.
5. Optional: click **Crop** and drag the exact visible area that should appear in every captured frame.
6. Choose:
   - **Full / load to top** — repeatedly reaches the top until older/lazy-loaded content becomes stable.
   - **Current to bottom** — starts exactly where you are.
7. Click **Capture PDF**.

No extra WhatsApp login, no separate Playwright profile, no cloud upload.

## Clean stitching

Shotdown does not simply paste screenshots at fixed intervals.

For every frame it:

- records the actual scroll delta;
- waits for layout changes and visible images;
- captures with intentional overlap;
- compares the bottom of the previous frame with the top of the next frame;
- finds the best visual seam close to the expected scroll overlap;
- retries a difficult seam after another stabilization wait;
- only falls back to the measured scroll delta when visual matching remains ambiguous.

This is meant to avoid duplicated message rows, missing rows, black bands, and the broken stripes commonly produced by generic full-page screenshot tools on virtualized chat UIs.

## Lazy-loaded and virtualized content

Shotdown explicitly avoids treating a temporary lack of scroll movement as the end.

**Before a Full capture**, it repeatedly sets the selected container to the top, waits for the DOM/layout to stabilize, fingerprints the leading content, and requires multiple stable passes before deciding that older history has finished loading.

**During capture**, the maximum scroll range is recalculated continuously. If scrolling stalls or the container reaches its current bottom, Shotdown waits for additional content and requires repeated stable bottom checks before ending the capture.

The original scroll position is restored when the run finishes or is cancelled.

## PDF evidence defaults

The extension exports A4 PDFs and checks the **actual PDF byte size**.

- target: **2 PDF files**
- fallback: **up to 3 PDF files**
- default hard limit: **3,000,000 bytes per PDF**
- compression prioritizes readable resolution before aggressive downscaling
- files are saved under the browser Downloads folder in `Shotdown/`

If two files would require excessive compression, Shotdown tries three before using the aggressive fallback profile.

## Install / run on Windows

There is no build step and no Node/Python dependency for the browser extension.

Run:

```text
run_extension.bat
```

The helper opens the extension folder and your browser's extension manager.

On the first run:

1. Enable **Developer mode**.
2. Click **Load unpacked**.
3. Select the repository's `extension` folder.
4. Pin **Shotdown** to the toolbar.

After that, just use your normal browser and click the Shotdown icon whenever you want to capture something.

Chrome: `chrome://extensions/`  
Edge: `edge://extensions/`

## Keyboard shortcut

The manifest registers:

```text
Alt + Shift + S
```

You can change it in the browser's extension-shortcuts page.

## Privacy

Shotdown uses the current active tab only after you invoke it.

- no separate browser profile;
- no account/session copying;
- no telemetry;
- no remote screenshot service;
- no chat upload;
- processing and PDF creation happen inside your browser.

The extension requests only `activeTab`, `scripting`, and `downloads`.

## Project structure

```text
extension/
  manifest.json
  service-worker.js
  content.js

run_extension.bat
package_extension.bat

src/longchatpdf/
  ... legacy desktop implementation ...
```

The browser extension is now the primary Shotdown experience. The Python desktop implementation remains in the repository as a legacy/fallback implementation while the extension matures.

## Browser limitations

Shotdown cannot run on protected browser pages such as `chrome://`, `edge://`, extension-store pages, or other pages where Chromium blocks extension script injection.

Highly dynamic sites can still change their layout during capture. When Shotdown reports a seam fallback, review the resulting PDF once before submitting it as evidence.

## Development check

The extension has no bundler. Syntax can be checked directly:

```powershell
node --check extension\content.js
node --check extension\service-worker.js
```

GitHub Actions runs these checks automatically.

## License

MIT. Shotdown is not affiliated with or endorsed by WhatsApp or Meta.
