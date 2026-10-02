(() => {
  if (window.__shotdownInstalled) {
    return;
  }
  window.__shotdownInstalled = true;

  const APP_ID = "shotdown-browser-extension-root";
  const state = {
    mode: "idle",
    candidate: null,
    target: null,
    crop: null,
    captureRunning: false,
    cancelled: false,
    seamWarnings: 0,
    originalScrollTop: 0,
    originalScrollBehavior: "",
  };

  let host;
  let shadow;
  let highlight;
  let cropBox;
  let toolbar;
  let hint;
  let targetInfo;
  let statusText;
  let rangeSelect;
  let maxMbInput;
  let captureButton;
  let cropButton;
  let parentButton;
  let reselectButton;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextPaint() {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isRootScroller(el) {
    return el === document.scrollingElement || el === document.documentElement || el === document.body;
  }

  function getRect(el) {
    if (!el || isRootScroller(el)) {
      return {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }

  function intersectViewport(rect) {
    const left = clamp(rect.left, 0, window.innerWidth);
    const top = clamp(rect.top, 0, window.innerHeight);
    const right = clamp(rect.right, 0, window.innerWidth);
    const bottom = clamp(rect.bottom, 0, window.innerHeight);
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  function isScrollable(el) {
    if (!el || el === host || host?.contains(el)) return false;
    const root = isRootScroller(el);
    const rect = getRect(el);
    if (rect.width < 120 || rect.height < 100) return false;

    const scrollableHeight = Number(el.scrollHeight || 0) - Number(el.clientHeight || 0);
    if (scrollableHeight < 16) return false;
    if (root) return true;

    const style = getComputedStyle(el);
    return /(auto|scroll|overlay)/.test(style.overflowY || "");
  }

  function nearestScrollableFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.documentElement) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    const root = document.scrollingElement;
    return isScrollable(root) ? root : null;
  }

  function scrollableParent(el) {
    if (!el) return null;
    let parent = el.parentElement;
    while (parent) {
      if (isScrollable(parent)) return parent;
      parent = parent.parentElement;
    }
    const root = document.scrollingElement;
    return root && root !== el && isScrollable(root) ? root : null;
  }

  function scrollTopOf(el) {
    return Number(el?.scrollTop || 0);
  }

  function setScrollTop(el, value) {
    if (!el) return;
    el.scrollTop = value;
  }

  function maxScrollTop(el) {
    return Math.max(0, Number(el.scrollHeight || 0) - Number(el.clientHeight || 0));
  }

  function shortLabel(el) {
    if (!el) return "No target";
    if (isRootScroller(el)) return "Page";
    const bits = [];
    bits.push((el.tagName || "element").toLowerCase());
    if (el.id) bits.push("#" + el.id.slice(0, 24));
    if (el.getAttribute("role")) bits.push("[role=" + el.getAttribute("role") + "]");
    return bits.join("");
  }

  function textFingerprint(el, edge) {
    let text = "";
    try {
      text = String(el.innerText || "");
    } catch (_) {
      text = "";
    }
    text = edge === "bottom" ? text.slice(-1800) : text.slice(0, 1800);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function snapshot(el, edge) {
    return {
      top: scrollTopOf(el),
      max: maxScrollTop(el),
      height: Number(el.scrollHeight || 0),
      client: Number(el.clientHeight || 0),
      fp: textFingerprint(el, edge),
    };
  }

  function assertNotCancelled() {
    if (state.cancelled) {
      throw new Error("Capture cancelled.");
    }
  }

  function createUi() {
    host = document.createElement("div");
    host.id = APP_ID;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "none";
    host.style.display = "none";

    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =
      ":host{all:initial}" +
      "*{box-sizing:border-box}" +
      ".sd-highlight{position:fixed;border:2px solid #111;background:rgba(255,255,255,.05);box-shadow:0 0 0 1px rgba(255,255,255,.65) inset;pointer-events:none}" +
      ".sd-crop{position:fixed;border:2px solid #111;background:rgba(255,255,255,.10);box-shadow:0 0 0 99999px rgba(0,0,0,.28);pointer-events:none}" +
      ".sd-hint{position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:9px 12px;border:1px solid #dededb;background:#fff;color:#171717;border-radius:8px;font:600 12px/1.2 'Segoe UI',Arial,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.10);white-space:nowrap}" +
      ".sd-toolbar{position:fixed;right:18px;top:18px;width:326px;padding:14px;border:1px solid #dededb;background:#fff;color:#171717;border-radius:10px;box-shadow:0 12px 38px rgba(0,0,0,.14);font:12px/1.35 'Segoe UI',Arial,sans-serif;pointer-events:auto}" +
      ".sd-title{font:700 16px/1.15 'Segoe UI',Arial,sans-serif;margin:0 0 3px}.sd-sub{color:#777773;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".sd-row{display:flex;gap:7px;align-items:center;margin-top:8px}.sd-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}" +
      ".sd-label{display:block;color:#777773;font-size:10px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:.04em}" +
      ".sd-select,.sd-input{width:100%;height:34px;border:1px solid #dededb;border-radius:7px;background:#fafaf8;color:#171717;padding:0 9px;font:12px 'Segoe UI',Arial,sans-serif;outline:none}" +
      ".sd-button{height:34px;border:1px solid #dededb;border-radius:7px;background:#fff;color:#171717;padding:0 10px;font:600 12px 'Segoe UI',Arial,sans-serif;cursor:pointer}.sd-button:hover{background:#f5f5f2}" +
      ".sd-button.primary{background:#171717;color:#fff;border-color:#171717;flex:1}.sd-button.primary:hover{background:#2b2b2b}" +
      ".sd-button:disabled{opacity:.45;cursor:default}" +
      ".sd-status{margin-top:10px;padding-top:10px;border-top:1px solid #ecece9;color:#777773;min-height:27px}" +
      "@media(prefers-color-scheme:dark){" +
      ".sd-highlight{border-color:#f2f2f1;box-shadow:0 0 0 1px rgba(0,0,0,.7) inset}.sd-crop{border-color:#f2f2f1;background:rgba(255,255,255,.06);box-shadow:0 0 0 99999px rgba(0,0,0,.40)}" +
      ".sd-hint,.sd-toolbar{background:#202326;color:#f4f4f3;border-color:#383b3f;box-shadow:0 12px 38px rgba(0,0,0,.34)}.sd-sub,.sd-status,.sd-label{color:#a6a9ad}" +
      ".sd-select,.sd-input{background:#272a2e;color:#f4f4f3;border-color:#3b3e43}.sd-button{background:#202326;color:#f4f4f3;border-color:#3b3e43}.sd-button:hover{background:#292c30}" +
      ".sd-button.primary{background:#f1f2f2;color:#17191b;border-color:#f1f2f2}.sd-button.primary:hover{background:#fff}.sd-status{border-top-color:#34373b}" +
      "}";

    shadow.appendChild(style);

    highlight = document.createElement("div");
    highlight.className = "sd-highlight";
    highlight.style.display = "none";
    shadow.appendChild(highlight);

    cropBox = document.createElement("div");
    cropBox.className = "sd-crop";
    cropBox.style.display = "none";
    shadow.appendChild(cropBox);

    hint = document.createElement("div");
    hint.className = "sd-hint";
    hint.style.display = "none";
    shadow.appendChild(hint);

    toolbar = document.createElement("div");
    toolbar.className = "sd-toolbar";
    toolbar.style.display = "none";
    toolbar.innerHTML =
      '<div class="sd-title">Shotdown</div>' +
      '<div class="sd-sub" id="sd-target">No target</div>' +
      '<div class="sd-row">' +
      '<button class="sd-button" id="sd-reselect">Reselect</button>' +
      '<button class="sd-button" id="sd-parent">Parent</button>' +
      '<button class="sd-button" id="sd-crop">Crop</button>' +
      '</div>' +
      '<div class="sd-grid">' +
      '<label><span class="sd-label">Range</span><select class="sd-select" id="sd-range"><option value="full">Full / load to top</option><option value="current">Current to bottom</option></select></label>' +
      '<label><span class="sd-label">Max MB / PDF</span><input class="sd-input" id="sd-max" type="number" min="0.5" max="50" step="0.1" value="3.0"></label>' +
      '</div>' +
      '<div class="sd-row">' +
      '<button class="sd-button primary" id="sd-capture">Capture PDF</button>' +
      '</div>' +
      '<div class="sd-status" id="sd-status">Ready.</div>';

    shadow.appendChild(toolbar);
    document.documentElement.appendChild(host);

    targetInfo = shadow.getElementById("sd-target");
    statusText = shadow.getElementById("sd-status");
    rangeSelect = shadow.getElementById("sd-range");
    maxMbInput = shadow.getElementById("sd-max");
    captureButton = shadow.getElementById("sd-capture");
    cropButton = shadow.getElementById("sd-crop");
    parentButton = shadow.getElementById("sd-parent");
    reselectButton = shadow.getElementById("sd-reselect");

    for (const el of [toolbar, captureButton, cropButton, parentButton, reselectButton, rangeSelect, maxMbInput]) {
      el.addEventListener("click", (event) => event.stopPropagation());
      el.addEventListener("mousedown", (event) => event.stopPropagation());
      el.addEventListener("mouseup", (event) => event.stopPropagation());
    }

    reselectButton.addEventListener("click", () => enterSelectMode());
    parentButton.addEventListener("click", () => {
      const parent = scrollableParent(state.target);
      if (parent) lockTarget(parent);
    });
    cropButton.addEventListener("click", () => enterCropMode());
    captureButton.addEventListener("click", () => startCapture());
  }

  function setBox(el, rect) {
    el.style.left = Math.round(rect.left) + "px";
    el.style.top = Math.round(rect.top) + "px";
    el.style.width = Math.max(0, Math.round(rect.width)) + "px";
    el.style.height = Math.max(0, Math.round(rect.height)) + "px";
  }

  function showHint(message) {
    hint.textContent = message;
    hint.style.display = "block";
  }

  function setStatus(message) {
    statusText.textContent = message;
  }

  function enterSelectMode() {
    state.mode = "select";
    state.candidate = null;
    state.target = null;
    state.crop = null;
    state.cancelled = false;
    host.style.display = "block";
    toolbar.style.display = "none";
    cropBox.style.display = "none";
    highlight.style.display = "none";
    showHint("Hover a scrollable area, then click to select it · Esc to close");
  }

  function lockTarget(el) {
    if (!el) return;
    state.mode = "locked";
    state.target = el;
    state.candidate = el;
    state.crop = null;

    const rect = intersectViewport(getRect(el));
    setBox(highlight, rect);
    highlight.style.display = "block";
    cropBox.style.display = "none";
    hint.style.display = "none";
    toolbar.style.display = "block";

    targetInfo.textContent =
      shortLabel(el) +
      " · " +
      Math.round(rect.width) +
      "×" +
      Math.round(rect.height) +
      " · " +
      Math.round(maxScrollTop(el)) +
      "px scroll";

    parentButton.disabled = !scrollableParent(el);
    cropButton.textContent = "Crop";
    setStatus("Target locked. Crop it if needed, then capture.");
  }

  function enterCropMode() {
    if (!state.target || state.captureRunning) return;
    state.mode = "crop";
    toolbar.style.display = "none";
    cropBox.style.display = "none";
    highlight.style.display = "block";
    showHint("Drag the exact visible region you want repeated through the full capture · Esc to cancel crop");
  }

  let cropStart = null;

  function onMouseMove(event) {
    if (state.captureRunning) return;

    if (state.mode === "select") {
      const candidate = nearestScrollableFromPoint(event.clientX, event.clientY);
      if (candidate !== state.candidate) {
        state.candidate = candidate;
        if (candidate) {
          setBox(highlight, intersectViewport(getRect(candidate)));
          highlight.style.display = "block";
        } else {
          highlight.style.display = "none";
        }
      }
      return;
    }

    if (state.mode === "crop" && cropStart) {
      event.preventDefault();
      const bounds = intersectViewport(getRect(state.target));
      const x = clamp(event.clientX, bounds.left, bounds.right);
      const y = clamp(event.clientY, bounds.top, bounds.bottom);
      const rect = {
        left: Math.min(cropStart.x, x),
        top: Math.min(cropStart.y, y),
        right: Math.max(cropStart.x, x),
        bottom: Math.max(cropStart.y, y),
      };
      rect.width = rect.right - rect.left;
      rect.height = rect.bottom - rect.top;
      setBox(cropBox, rect);
      cropBox.style.display = "block";
    }
  }

  function onMouseDown(event) {
    if (state.captureRunning) return;
    if (state.mode !== "crop") return;
    if (event.button !== 0) return;
    if (event.composedPath().includes(toolbar)) return;

    event.preventDefault();
    event.stopPropagation();

    const bounds = intersectViewport(getRect(state.target));
    cropStart = {
      x: clamp(event.clientX, bounds.left, bounds.right),
      y: clamp(event.clientY, bounds.top, bounds.bottom),
    };
    cropBox.style.display = "none";
  }

  function onMouseUp(event) {
    if (state.captureRunning) return;
    if (state.mode !== "crop" || !cropStart) return;

    event.preventDefault();
    event.stopPropagation();

    const bounds = intersectViewport(getRect(state.target));
    const x = clamp(event.clientX, bounds.left, bounds.right);
    const y = clamp(event.clientY, bounds.top, bounds.bottom);
    const left = Math.min(cropStart.x, x);
    const top = Math.min(cropStart.y, y);
    const right = Math.max(cropStart.x, x);
    const bottom = Math.max(cropStart.y, y);
    cropStart = null;

    if (right - left < 80 || bottom - top < 80) {
      state.mode = "locked";
      cropBox.style.display = "none";
      hint.style.display = "none";
      toolbar.style.display = "block";
      setStatus("Crop was too small. Using the full selected region.");
      return;
    }

    state.crop = {
      left: left - bounds.left,
      top: top - bounds.top,
      width: right - left,
      height: bottom - top,
    };

    state.mode = "locked";
    hint.style.display = "none";
    toolbar.style.display = "block";
    cropButton.textContent = "Recrop";
    setStatus("Crop locked: " + Math.round(state.crop.width) + "×" + Math.round(state.crop.height) + ".");
  }

  function onClick(event) {
    if (state.captureRunning) return;
    if (state.mode !== "select") return;
    if (event.composedPath().includes(toolbar)) return;

    event.preventDefault();
    event.stopPropagation();
    if (state.candidate) lockTarget(state.candidate);
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;

    if (state.captureRunning) {
      state.cancelled = true;
      setStatus("Cancelling after the current frame...");
      return;
    }

    if (state.mode === "crop") {
      cropStart = null;
      state.mode = "locked";
      cropBox.style.display = state.crop ? "block" : "none";
      hint.style.display = "none";
      toolbar.style.display = "block";
      return;
    }

    closeUi();
  }

  function closeUi() {
    state.mode = "idle";
    state.candidate = null;
    state.target = null;
    state.crop = null;
    host.style.display = "none";
  }

  function currentClipCss() {
    const bounds = intersectViewport(getRect(state.target));
    if (!state.crop) return bounds;

    const left = bounds.left + state.crop.left;
    const top = bounds.top + state.crop.top;
    const width = Math.min(state.crop.width, bounds.right - left);
    const height = Math.min(state.crop.height, bounds.bottom - top);

    return intersectViewport({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    });
  }

  async function requestVisibleScreenshot() {
    const response = await chrome.runtime.sendMessage({ type: "SHOTDOWN_CAPTURE_VISIBLE" });
    if (!response?.ok || !response.dataUrl) {
      throw new Error(response?.error || "Browser screenshot failed.");
    }
    return response.dataUrl;
  }

  function imageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode browser screenshot."));
      image.src = dataUrl;
    });
  }

  async function captureClip(clipCss) {
    const previousDisplay = host.style.display;
    let dataUrl;

    try {
      host.style.display = "none";
      await nextPaint();
      dataUrl = await requestVisibleScreenshot();
    } finally {
      host.style.display = previousDisplay || "block";
      await nextPaint();
    }

    const image = await imageFromDataUrl(dataUrl);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;

    const sx = Math.max(0, Math.round(clipCss.left * scaleX));
    const sy = Math.max(0, Math.round(clipCss.top * scaleY));
    const sw = Math.max(1, Math.min(image.naturalWidth - sx, Math.round(clipCss.width * scaleX)));
    const sh = Math.max(1, Math.min(image.naturalHeight - sy, Math.round(clipCss.height * scaleY)));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext("2d", { alpha: false }).drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  }

  async function waitVisibleImages(clip, timeoutMs) {
    const deadline = performance.now() + timeoutMs;

    while (performance.now() < deadline) {
      assertNotCancelled();
      const images = Array.from(state.target.querySelectorAll?.("img") || []);
      const pending = images.some((img) => {
        const r = img.getBoundingClientRect();
        const intersects =
          r.right > clip.left &&
          r.left < clip.right &&
          r.bottom > clip.top &&
          r.top < clip.bottom;
        return intersects && (!img.complete || !img.naturalWidth);
      });
      if (!pending) return;
      await sleep(120);
    }
  }

  async function waitForLayout(el, minWaitMs = 260, maxWaitMs = 1800) {
    const start = performance.now();
    let stable = 0;
    let previous = "";

    while (performance.now() - start < maxWaitMs) {
      assertNotCancelled();
      const s = snapshot(el, "bottom");
      const key = [Math.round(s.top), s.height, s.client, s.fp].join(":");
      if (key === previous) stable += 1;
      else stable = 0;
      previous = key;

      if (performance.now() - start >= minWaitMs && stable >= 2) return;
      await sleep(120);
    }
  }

  async function loadAllTheWayToTop(el) {
    setStatus("Loading older content before capture...");
    const started = performance.now();
    let stable = 0;
    let previousKey = "";
    let rounds = 0;

    while (performance.now() - started < 180000) {
      assertNotCancelled();
      setScrollTop(el, 0);
      await sleep(760);
      await waitForLayout(el, 300, 1400);

      const s = snapshot(el, "top");
      rounds += 1;
      const key = [s.height, s.fp].join(":");

      if (s.top <= 2 && key === previousKey) stable += 1;
      else stable = 0;

      previousKey = key;
      setStatus(
        "Loading older content… pass " +
          rounds +
          (stable ? " · stable " + stable + "/8" : ""),
      );

      if (stable >= 8 && performance.now() - started > 6500) break;
    }

    setScrollTop(el, 0);
    await waitForLayout(el, 500, 2200);
  }

  async function waitForBottomGrowth(el) {
    let previous = snapshot(el, "bottom");
    let stable = 0;

    for (let i = 0; i < 9; i += 1) {
      assertNotCancelled();
      setScrollTop(el, maxScrollTop(el));
      await sleep(620);
      const now = snapshot(el, "bottom");

      const grew = now.height > previous.height + 2 || now.max > previous.max + 2;
      const changed = grew || now.fp !== previous.fp;

      if (grew) {
        await waitForLayout(el, 250, 1500);
        return true;
      }

      if (!changed && now.top >= now.max - 2) stable += 1;
      else stable = 0;

      if (stable >= 6) return false;
      previous = now;
    }

    return false;
  }

  async function advanceScroll(el, stepCss) {
    const start = snapshot(el, "bottom");

    if (start.top >= start.max - 2) {
      const grew = await waitForBottomGrowth(el);
      if (!grew) return { done: true, delta: 0, after: snapshot(el, "bottom") };
    }

    let before = snapshot(el, "bottom");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      assertNotCancelled();

      const max = maxScrollTop(el);
      const desired = Math.min(max, before.top + stepCss);
      setScrollTop(el, desired);
      await sleep(180);
      await waitForLayout(el, 220, 1300);

      const after = snapshot(el, "bottom");
      const delta = after.top - before.top;

      if (delta > 0.5) {
        return { done: false, delta, after };
      }

      if (after.top >= after.max - 2) {
        const grew = await waitForBottomGrowth(el);
        if (!grew) return { done: true, delta: 0, after };
        before = snapshot(el, "bottom");
        continue;
      }

      if (after.height !== before.height || after.fp !== before.fp) {
        before = after;
      }

      await sleep(350);
    }

    throw new Error(
      "The selected region stopped scrolling before the bottom became stable. " +
        "Shotdown waited for lazy-loaded content but the page still did not advance.",
    );
  }

  function getImageData(canvas) {
    return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  }

  function overlapScore(a, b, overlap) {
    const width = Math.min(a.width, b.width);
    const rows = 18;
    const cols = 28;
    let total = 0;
    let count = 0;

    for (let ry = 0; ry < rows; ry += 1) {
      const relY = (ry + 0.5) / rows;
      const ay = clamp(Math.floor(a.height - overlap + relY * overlap), 0, a.height - 1);
      const by = clamp(Math.floor(relY * overlap), 0, b.height - 1);

      for (let rx = 0; rx < cols; rx += 1) {
        const relX = 0.08 + ((rx + 0.5) / cols) * 0.84;
        const x = clamp(Math.floor(relX * width), 0, width - 1);

        const ai = (ay * a.width + x) * 4;
        const bi = (by * b.width + x) * 4;

        total +=
          Math.abs(a.data[ai] - b.data[bi]) +
          Math.abs(a.data[ai + 1] - b.data[bi + 1]) +
          Math.abs(a.data[ai + 2] - b.data[bi + 2]);
        count += 3;
      }
    }

    return count ? total / count : 255;
  }

  function findOverlap(previousCanvas, currentCanvas, expectedOverlap) {
    const a = getImageData(previousCanvas);
    const b = getImageData(currentCanvas);
    const h = Math.min(a.height, b.height);

    const expected = clamp(Math.round(expectedOverlap), 8, Math.floor(h * 0.72));
    const radius = Math.max(36, Math.min(170, Math.round(h * 0.18)));
    const min = Math.max(8, expected - radius);
    const max = Math.min(Math.floor(h * 0.72), expected + radius);

    let bestOverlap = expected;
    let bestVisual = Infinity;
    let bestCombined = Infinity;

    for (let overlap = min; overlap <= max; overlap += 3) {
      const visual = overlapScore(a, b, overlap);
      const combined = visual + Math.abs(overlap - expected) * 0.028;
      if (combined < bestCombined) {
        bestCombined = combined;
        bestVisual = visual;
        bestOverlap = overlap;
      }
    }

    return {
      overlap: bestVisual <= 23 ? bestOverlap : expected,
      confident: bestVisual <= 23,
      score: bestVisual,
      expected,
    };
  }

  function cropCanvas(canvas, top) {
    top = clamp(Math.round(top), 0, canvas.height - 1);
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = Math.max(1, canvas.height - top);
    out.getContext("2d", { alpha: false }).drawImage(
      canvas,
      0,
      top,
      canvas.width,
      out.height,
      0,
      0,
      canvas.width,
      out.height,
    );
    return out;
  }

  function sampleBackground(canvas) {
    const ctx = canvas.getContext("2d");
    const points = [
      [1, 1],
      [Math.max(1, canvas.width - 2), 1],
      [1, Math.max(1, canvas.height - 2)],
    ];
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [x, y] of points) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      r += d[0];
      g += d[1];
      b += d[2];
    }
    return "rgb(" + Math.round(r / 3) + "," + Math.round(g / 3) + "," + Math.round(b / 3) + ")";
  }

  function packIntoA4Pages(strips) {
    if (!strips.length) throw new Error("No captured content to export.");

    const width = strips[0].width;
    const pageHeight = Math.max(256, Math.round(width * (841.89 / 595.28)));
    const background = sampleBackground(strips[0]);
    const pages = [];

    let page = document.createElement("canvas");
    page.width = width;
    page.height = pageHeight;
    let ctx = page.getContext("2d", { alpha: false });
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, pageHeight);
    let y = 0;

    function flush() {
      pages.push(page);
      page = document.createElement("canvas");
      page.width = width;
      page.height = pageHeight;
      ctx = page.getContext("2d", { alpha: false });
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, pageHeight);
      y = 0;
    }

    for (const strip of strips) {
      let sourceY = 0;
      while (sourceY < strip.height) {
        const remaining = pageHeight - y;
        const sourceHeightAtBaseWidth = strip.height * (width / strip.width);
        const availableSource = Math.max(
          1,
          Math.floor(remaining * (strip.width / width)),
        );
        const take = Math.min(strip.height - sourceY, availableSource);
        const drawHeight = take * (width / strip.width);

        ctx.drawImage(
          strip,
          0,
          sourceY,
          strip.width,
          take,
          0,
          y,
          width,
          drawHeight,
        );

        y += drawHeight;
        sourceY += take;

        if (y >= pageHeight - 0.5) flush();
      }
    }

    if (y > 1 || !pages.length) {
      pages.push(page);
    }

    return pages;
  }

  function canvasToJpeg(canvas, scale, quality) {
    return new Promise((resolve, reject) => {
      const out = document.createElement("canvas");
      out.width = Math.max(320, Math.round(canvas.width * scale));
      out.height = Math.max(1, Math.round(canvas.height * scale));
      out
        .getContext("2d", { alpha: false })
        .drawImage(canvas, 0, 0, out.width, out.height);

      out.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error("JPEG compression failed."));
            return;
          }
          resolve({
            bytes: new Uint8Array(await blob.arrayBuffer()),
            width: out.width,
            height: out.height,
          });
        },
        "image/jpeg",
        quality,
      );
    });
  }

  function splitRanges(sizes, parts) {
    const n = sizes.length;
    parts = Math.max(1, Math.min(parts, n));
    const ranges = [];
    let start = 0;
    let remainingTotal = sizes.reduce((a, b) => a + b, 0);

    for (let part = 0; part < parts; part += 1) {
      const remainingParts = parts - part;
      if (remainingParts === 1) {
        ranges.push([start, n]);
        break;
      }

      const target = remainingTotal / remainingParts;
      let end = start;
      let sum = 0;
      const mustLeave = remainingParts - 1;

      while (end < n - mustLeave) {
        const next = sizes[end];
        if (end > start && sum + next > target) {
          const without = Math.abs(target - sum);
          const withNext = Math.abs(target - (sum + next));
          if (withNext < without) {
            sum += next;
            end += 1;
          }
          break;
        }
        sum += next;
        end += 1;
      }

      if (end === start) {
        sum += sizes[end];
        end += 1;
      }

      ranges.push([start, end]);
      start = end;
      remainingTotal -= sum;
    }

    return ranges;
  }

  const encoder = new TextEncoder();

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  function ascii(text) {
    return encoder.encode(text);
  }

  function buildPdf(jpegs, start, end) {
    const pageCount = end - start;
    const objectCount = 2 + pageCount * 3;
    const objects = new Array(objectCount + 1);

    objects[1] = ascii("<< /Type /Catalog /Pages 2 0 R >>");

    const kids = [];
    for (let i = 0; i < pageCount; i += 1) {
      kids.push(3 + i * 3 + " 0 R");
    }
    objects[2] = ascii("<< /Type /Pages /Count " + pageCount + " /Kids [ " + kids.join(" ") + " ] >>");

    const pageW = 595.28;
    const pageH = 841.89;

    for (let local = 0; local < pageCount; local += 1) {
      const jpeg = jpegs[start + local];
      const pageObj = 3 + local * 3;
      const imageObj = pageObj + 1;
      const contentObj = pageObj + 2;

      objects[pageObj] = ascii(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
          pageW +
          " " +
          pageH +
          "] /Resources << /XObject << /Im" +
          local +
          " " +
          imageObj +
          " 0 R >> >> /Contents " +
          contentObj +
          " 0 R >>",
      );

      const imageHeader = ascii(
        "<< /Type /XObject /Subtype /Image /Width " +
          jpeg.width +
          " /Height " +
          jpeg.height +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
          jpeg.bytes.length +
          " >>\nstream\n",
      );
      const imageFooter = ascii("\nendstream");
      objects[imageObj] = concatBytes([imageHeader, jpeg.bytes, imageFooter]);

      const command =
        "q\n" +
        pageW +
        " 0 0 " +
        pageH +
        " 0 0 cm\n/Im" +
        local +
        " Do\nQ\n";
      const commandBytes = ascii(command);
      objects[contentObj] = concatBytes([
        ascii("<< /Length " + commandBytes.length + " >>\nstream\n"),
        commandBytes,
        ascii("endstream"),
      ]);
    }

    const chunks = [ascii("%PDF-1.4\n%Shotdown\n")];
    const offsets = new Array(objectCount + 1).fill(0);
    let position = chunks[0].length;

    for (let i = 1; i <= objectCount; i += 1) {
      offsets[i] = position;
      const head = ascii(i + " 0 obj\n");
      const tail = ascii("\nendobj\n");
      chunks.push(head, objects[i], tail);
      position += head.length + objects[i].length + tail.length;
    }

    const xrefOffset = position;
    let xref = "xref\n0 " + (objectCount + 1) + "\n";
    xref += "0000000000 65535 f \n";
    for (let i = 1; i <= objectCount; i += 1) {
      xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    xref +=
      "trailer\n<< /Size " +
      (objectCount + 1) +
      " /Root 1 0 R >>\nstartxref\n" +
      xrefOffset +
      "\n%%EOF";

    chunks.push(ascii(xref));
    return concatBytes(chunks);
  }

  async function encodePages(pages, scale, quality) {
    const out = [];
    for (let i = 0; i < pages.length; i += 1) {
      assertNotCancelled();
      setStatus(
        "Compressing PDF pages… " +
          (i + 1) +
          "/" +
          pages.length +
          " · " +
          Math.round(scale * 100) +
          "% · q" +
          Math.round(quality * 100),
      );
      out.push(await canvasToJpeg(pages[i], scale, quality));
    }
    return out;
  }

  async function fitPdfs(pages, maxBytes) {
    const normalScales = [1, 0.92, 0.84, 0.76, 0.68];
    const normalQualities = [0.9, 0.8, 0.7, 0.62, 0.56];
    const aggressiveScales = [0.62, 0.56, 0.5];
    const aggressiveQualities = [0.52, 0.44, 0.36];

    const plans = [
      { parts: Math.min(2, pages.length), scales: normalScales, qualities: normalQualities },
      { parts: Math.min(3, pages.length), scales: normalScales, qualities: normalQualities },
      { parts: Math.min(3, pages.length), scales: aggressiveScales, qualities: aggressiveQualities },
    ];

    const seen = new Set();

    for (const plan of plans) {
      const key = plan.parts + ":" + plan.scales.join(",");
      if (seen.has(key) || plan.parts < 1) continue;
      seen.add(key);

      for (const scale of plan.scales) {
        for (const quality of plan.qualities) {
          assertNotCancelled();

          const jpegs = await encodePages(pages, scale, quality);
          const sizes = jpegs.map((item) => item.bytes.length);
          const ranges = splitRanges(sizes, plan.parts);
          const pdfs = ranges.map(([start, end]) => buildPdf(jpegs, start, end));

          if (pdfs.every((pdf) => pdf.length <= maxBytes)) {
            return { pdfs, ranges, scale, quality };
          }
        }
      }
    }

    throw new Error(
      "This capture cannot stay readable inside the selected size limit and maximum 3 PDFs. " +
        "Use a smaller crop/range or increase the MB limit.",
    );
  }

  function bytesToDataUrl(bytes, mime) {
    const chunk = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return "data:" + mime + ";base64," + btoa(binary);
  }

  function timestampName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "_" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  async function downloadPdfs(result) {
    const total = result.pdfs.length;
    const stamp = timestampName();

    for (let i = 0; i < total; i += 1) {
      const filename =
        "Shotdown/shotdown_" +
        stamp +
        "_part_" +
        String(i + 1).padStart(2, "0") +
        "-of-" +
        String(total).padStart(2, "0") +
        ".pdf";

      const response = await chrome.runtime.sendMessage({
        type: "SHOTDOWN_DOWNLOAD",
        filename,
        dataUrl: bytesToDataUrl(result.pdfs[i], "application/pdf"),
      });

      if (!response?.ok) {
        throw new Error(response?.error || "PDF download failed.");
      }
    }
  }

  async function captureAllStrips(el, clipCss) {
    const strips = [];
    state.seamWarnings = 0;

    await waitVisibleImages(clipCss, 1800);
    await waitForLayout(el, 320, 1800);

    let previous = await captureClip(clipCss);
    strips.push(previous);

    let shotCount = 1;

    while (shotCount < 12000) {
      assertNotCancelled();

      const freshClip = currentClipCss();
      const stepCss = Math.max(80, Math.floor(freshClip.height - 120));
      const beforeTop = scrollTopOf(el);
      const movement = await advanceScroll(el, stepCss);

      if (movement.done) break;

      const afterTop = scrollTopOf(el);
      const deltaCss = Math.max(1, afterTop - beforeTop);

      await waitVisibleImages(freshClip, 1800);
      await waitForLayout(el, 260, 1700);
      await sleep(120);

      let current = await captureClip(freshClip);
      const scaleY = current.height / Math.max(1, freshClip.height);
      const expectedOverlap = Math.max(1, current.height - deltaCss * scaleY);
      let match = findOverlap(previous, current, expectedOverlap);

      if (!match.confident) {
        await sleep(520);
        await waitForLayout(el, 240, 1300);
        const retry = await captureClip(freshClip);
        const retryMatch = findOverlap(previous, retry, expectedOverlap);

        if (retryMatch.score < match.score) {
          current = retry;
          match = retryMatch;
        }

        if (!match.confident) state.seamWarnings += 1;
      }

      const newStrip = cropCanvas(current, match.overlap);
      strips.push(newStrip);
      previous = current;
      shotCount += 1;

      const s = snapshot(el, "bottom");
      const percent = s.max > 1 ? clamp((s.top / s.max) * 100, 0, 100) : 100;
      setStatus(
        "Capturing… " +
          percent.toFixed(1) +
          "% · " +
          shotCount +
          " frames" +
          (state.seamWarnings ? " · checking " + state.seamWarnings + " difficult seam(s)" : ""),
      );
    }

    return strips;
  }

  async function startCapture() {
    if (!state.target || state.captureRunning) return;

    const clip = currentClipCss();
    if (clip.width < 80 || clip.height < 80) {
      setStatus("The selected crop is too small.");
      return;
    }

    const maxMb = Number(maxMbInput.value);
    if (!Number.isFinite(maxMb) || maxMb < 0.5) {
      setStatus("Set Max MB / PDF to at least 0.5.");
      return;
    }

    state.captureRunning = true;
    state.cancelled = false;
    captureButton.disabled = true;
    cropButton.disabled = true;
    parentButton.disabled = true;
    reselectButton.disabled = true;
    rangeSelect.disabled = true;
    maxMbInput.disabled = true;

    const el = state.target;
    state.originalScrollTop = scrollTopOf(el);
    state.originalScrollBehavior = el.style?.scrollBehavior || "";

    try {
      if (el.style) el.style.scrollBehavior = "auto";

      if (rangeSelect.value === "full") {
        await loadAllTheWayToTop(el);
      }

      assertNotCancelled();
      setStatus("Starting clean capture…");
      const finalClip = currentClipCss();
      const strips = await captureAllStrips(el, finalClip);

      assertNotCancelled();
      setStatus("Stitching into A4 pages…");
      const pages = packIntoA4Pages(strips);

      const maxBytes = Math.floor(maxMb * 1000000);
      const result = await fitPdfs(pages, maxBytes);

      assertNotCancelled();
      setStatus("Saving " + result.pdfs.length + " PDF file(s)…");
      await downloadPdfs(result);

      const sizeText = result.pdfs
        .map((pdf) => (pdf.length / 1000000).toFixed(2) + " MB")
        .join(" · ");

      setStatus(
        "Done · " +
          result.pdfs.length +
          " PDF(s) · " +
          sizeText +
          (state.seamWarnings
            ? " · " + state.seamWarnings + " seam(s) used safe fallback; review once before submitting."
            : " · seams matched cleanly."),
      );
    } catch (error) {
      setStatus(String(error?.message || error));
    } finally {
      try {
        setScrollTop(el, state.originalScrollTop);
        if (el.style) el.style.scrollBehavior = state.originalScrollBehavior;
      } catch (_) {}

      state.captureRunning = false;
      state.cancelled = false;
      captureButton.disabled = false;
      cropButton.disabled = false;
      parentButton.disabled = !scrollableParent(state.target);
      reselectButton.disabled = false;
      rangeSelect.disabled = false;
      maxMbInput.disabled = false;
      host.style.display = "block";
    }
  }

  function activate() {
    if (!host) createUi();
    if (state.captureRunning) {
      host.style.display = "block";
      return;
    }
    enterSelectMode();
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SHOTDOWN_ACTIVATE") activate();
  });
})();
