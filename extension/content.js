(() => {
  const SCRIPT_VERSION = "0.4.0";

  if (window.__shotdownVersion === SCRIPT_VERSION) {
    return;
  }

  // A v0.3 page cannot safely remove its anonymous listeners. Reload once after
  // updating the unpacked extension; v0.4+ installs are hot-reloadable.
  if (window.__shotdownInstalled && !window.__shotdownCleanup) {
    return;
  }

  if (typeof window.__shotdownCleanup === "function") {
    try {
      window.__shotdownCleanup();
    } catch (_) {}
  }

  window.__shotdownInstalled = true;
  window.__shotdownVersion = SCRIPT_VERSION;

  const CORE = globalThis.ShotdownCore;
  if (!CORE || CORE.version !== SCRIPT_VERSION) {
    throw new Error("Shotdown core is missing or out of date. Reload the extension and this tab.");
  }

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
  let cancelButton;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextPaint() {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }

  function clamp(value, min, max) {
    return CORE.clamp(value, min, max);
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
      children: Number(el.childElementCount || 0),
      fp: textFingerprint(el, edge),
    };
  }

  function assertTargetUsable(el) {
    if (!el || !el.isConnected) {
      throw new Error("The selected scroll area was replaced by the page. Reselect it and try again.");
    }
    if (document.visibilityState !== "visible") {
      throw new Error("Keep this tab visible while Shotdown is capturing.");
    }
    const rect = intersectViewport(getRect(el));
    if (rect.width < 80 || rect.height < 80) {
      throw new Error("The selected scroll area is no longer visible. Reselect it and try again.");
    }
  }

  function assertNotCancelled() {
    if (state.cancelled) {
      throw new Error("Capture cancelled.");
    }
    if (state.captureRunning && state.target) {
      assertTargetUsable(state.target);
    }
  }

  function installCaptureFreeze(el) {
    const previous = el.getAttribute("data-shotdown-freeze");
    el.setAttribute("data-shotdown-freeze", "1");

    const style = document.createElement("style");
    style.setAttribute("data-shotdown-runtime-style", "1");
    style.textContent =
      '[data-shotdown-freeze="1"],[data-shotdown-freeze="1"] *{' +
      'scroll-behavior:auto!important;' +
      'animation-play-state:paused!important;' +
      'transition-duration:0s!important;' +
      'transition-delay:0s!important;' +
      'caret-color:transparent!important;' +
      '}';
    document.documentElement.appendChild(style);

    return () => {
      style.remove();
      if (previous == null) el.removeAttribute("data-shotdown-freeze");
      else el.setAttribute("data-shotdown-freeze", previous);
    };
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
      '<button class="sd-button" id="sd-cancel" style="display:none">Cancel</button>' +
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
    cancelButton = shadow.getElementById("sd-cancel");

    for (const el of [toolbar, captureButton, cropButton, parentButton, reselectButton, cancelButton, rangeSelect, maxMbInput]) {
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
    cancelButton.addEventListener("click", () => {
      if (!state.captureRunning) return;
      state.cancelled = true;
      setStatus("Cancelling after the current safe step…");
    });
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

  async function waitForLayout(el, minWaitMs = 320, maxWaitMs = 2200) {
    const started = performance.now();
    let stable = 0;
    let previous = "";
    let lastMutationAt = performance.now();

    const observer = new MutationObserver(() => {
      lastMutationAt = performance.now();
    });

    try {
      observer.observe(el, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["src", "class", "style", "aria-label"],
      });

      while (performance.now() - started < maxWaitMs) {
        assertNotCancelled();

        const s = snapshot(el, "bottom");
        const key = [
          Math.round(s.top),
          s.height,
          s.client,
          s.children,
          s.fp,
        ].join(":");

        if (key === previous) stable += 1;
        else stable = 0;
        previous = key;

        const elapsed = performance.now() - started;
        const quietFor = performance.now() - lastMutationAt;

        if (elapsed >= minWaitMs && stable >= 2 && quietFor >= 260) {
          return;
        }

        await sleep(120);
      }
    } finally {
      observer.disconnect();
    }
  }

  async function loadAllTheWayToTop(el) {
    setStatus("Loading older content before capture…");
    const started = performance.now();
    let stable = 0;
    let previousKey = "";
    let rounds = 0;
    let lastProgressAt = performance.now();

    while (performance.now() - started < 240000) {
      assertNotCancelled();
      assertTargetUsable(el);

      setScrollTop(el, 0);
      await sleep(520);
      await waitForLayout(el, 420, 2400);

      const s = snapshot(el, "top");
      rounds += 1;
      const key = [s.height, s.max, s.children, s.fp].join(":");

      if (s.top <= 2 && key === previousKey) {
        stable += 1;
      } else {
        stable = 0;
        lastProgressAt = performance.now();
      }

      previousKey = key;

      setStatus(
        "Loading older content… pass " +
          rounds +
          " · stable " +
          stable +
          "/10",
      );

      const stableLongEnough =
        stable >= 10 &&
        performance.now() - started > 9000 &&
        performance.now() - lastProgressAt > 5500;

      if (stableLongEnough) break;
    }

    setScrollTop(el, 0);
    await sleep(280);
    await waitForLayout(el, 650, 3000);
  }

  async function waitForBottomGrowth(el) {
    let previous = snapshot(el, "bottom");
    let stable = 0;

    for (let i = 0; i < 12; i += 1) {
      assertNotCancelled();
      assertTargetUsable(el);

      setScrollTop(el, maxScrollTop(el));
      await sleep(520);
      await waitForLayout(el, 260, 1600);

      const now = snapshot(el, "bottom");
      const grew =
        now.height > previous.height + 2 ||
        now.max > previous.max + 2;

      const changed =
        grew ||
        now.fp !== previous.fp ||
        now.children !== previous.children;

      if (grew) {
        await waitForLayout(el, 320, 1900);
        return true;
      }

      if (!changed && now.top >= now.max - 2) stable += 1;
      else stable = 0;

      if (stable >= 7) return false;
      previous = now;
    }

    return false;
  }

  async function advanceScroll(el, stepCss) {
    assertTargetUsable(el);
    const start = snapshot(el, "bottom");

    if (start.top >= start.max - 2) {
      const grew = await waitForBottomGrowth(el);
      if (!grew) {
        return { done: true, delta: 0, after: snapshot(el, "bottom") };
      }
    }

    let before = snapshot(el, "bottom");

    for (let attempt = 0; attempt < 14; attempt += 1) {
      assertNotCancelled();

      const max = maxScrollTop(el);
      const desired = Math.min(max, before.top + stepCss);
      setScrollTop(el, desired);

      await sleep(180);
      await waitForLayout(el, 260, 1700);

      const after = snapshot(el, "bottom");
      const delta = after.top - before.top;

      if (delta > 0.5) {
        return { done: false, delta, after };
      }

      if (after.top >= after.max - 2) {
        const grew = await waitForBottomGrowth(el);
        if (!grew) {
          return { done: true, delta: 0, after };
        }
        before = snapshot(el, "bottom");
        continue;
      }

      const contentChanged =
        after.height !== before.height ||
        after.fp !== before.fp ||
        after.children !== before.children;

      if (contentChanged) {
        before = after;
        await sleep(260);
        continue;
      }

      await sleep(420);
    }

    throw new Error(
      "The selected area stopped scrolling before the bottom became stable. " +
        "Shotdown waited for lazy-loaded content and retried safely, but the page still did not advance.",
    );
  }

  function getImageData(canvas) {
    return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  }

  function findOverlap(previousCanvas, currentCanvas, expectedOverlap) {
    return CORE.findOverlapFromImageData(
      getImageData(previousCanvas),
      getImageData(currentCanvas),
      expectedOverlap,
    );
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

  function canvasToBlob(canvas, type = "image/png", quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Browser image encoding failed."));
        },
        type,
        quality,
      );
    });
  }

  function extractCanvas(canvas, top = 0, bottom = 0) {
    const y = clamp(Math.round(top), 0, canvas.height - 1);
    const h = Math.max(
      1,
      canvas.height - y - clamp(Math.round(bottom), 0, canvas.height - y - 1),
    );

    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = h;
    out
      .getContext("2d", { alpha: false })
      .drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    return out;
  }

  function detectFixedBands(previousCanvas, currentCanvas) {
    return CORE.detectStaticBands(
      getImageData(previousCanvas),
      getImageData(currentCanvas),
    );
  }

  function createPageAssembler(seedCanvas) {
    const width = seedCanvas.width;
    const pageHeight = Math.max(
      256,
      Math.round(width * (841.89 / 595.28)),
    );
    const background = sampleBackground(seedCanvas);
    const pageBlobs = [];

    let page;
    let ctx;
    let y = 0;

    function resetPage() {
      page = document.createElement("canvas");
      page.width = width;
      page.height = pageHeight;
      ctx = page.getContext("2d", { alpha: false });
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, pageHeight);
      y = 0;
    }

    async function flush() {
      if (!page || y <= 0) return;
      pageBlobs.push(await canvasToBlob(page, "image/png"));
      page.width = 1;
      page.height = 1;
      resetPage();
    }

    async function add(strip) {
      let sourceY = 0;

      while (sourceY < strip.height) {
        assertNotCancelled();

        const scale = width / strip.width;
        const remaining = pageHeight - y;
        const availableSource = Math.max(
          1,
          Math.floor(remaining / scale),
        );
        const take = Math.min(strip.height - sourceY, availableSource);
        const drawHeight = take * scale;

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

        sourceY += take;
        y += drawHeight;

        if (y >= pageHeight - 0.5) {
          await flush();
        }
      }
    }

    async function finish() {
      if (y > 0 || !pageBlobs.length) {
        await flush();
      } else if (page) {
        page.width = 1;
        page.height = 1;
      }
      return pageBlobs;
    }

    resetPage();
    return { add, finish };
  }

  async function pageBlobToJpeg(pageBlob, scale, quality) {
    const bitmap = await createImageBitmap(pageBlob);
    try {
      const out = document.createElement("canvas");
      out.width = Math.max(320, Math.round(bitmap.width * scale));
      out.height = Math.max(1, Math.round(bitmap.height * scale));

      out
        .getContext("2d", { alpha: false })
        .drawImage(bitmap, 0, 0, out.width, out.height);

      const blob = await canvasToBlob(out, "image/jpeg", quality);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      out.width = 1;
      out.height = 1;

      return {
        bytes,
        width: Math.max(320, Math.round(bitmap.width * scale)),
        height: Math.max(1, Math.round(bitmap.height * scale)),
      };
    } finally {
      bitmap.close();
    }
  }

  function splitRanges(sizes, parts) {
    return CORE.splitRanges(sizes, parts);
  }

  function buildPdf(jpegs, start, end) {
    return CORE.buildPdf(jpegs, start, end, {
      title: "Shotdown capture - " + location.hostname,
      source: location.hostname,
    });
  }

  async function encodePages(pages, scale, quality) {
    const out = [];
    for (let i = 0; i < pages.length; i += 1) {
      assertNotCancelled();
      setStatus(
        "Optimizing PDF… page " +
          (i + 1) +
          "/" +
          pages.length +
          " · " +
          Math.round(scale * 100) +
          "% · q" +
          Math.round(quality * 100),
      );
      out.push(await pageBlobToJpeg(pages[i], scale, quality));
    }
    return out;
  }

  async function fitPdfs(pages, maxBytes) {
    const profiles = [
      {
        parts: Math.min(2, pages.length),
        scales: [1, 0.92, 0.84, 0.76, 0.68],
        minQuality: 0.56,
        maxQuality: 0.92,
      },
      {
        parts: Math.min(3, pages.length),
        scales: [1, 0.92, 0.84, 0.76, 0.68],
        minQuality: 0.56,
        maxQuality: 0.92,
      },
      {
        parts: Math.min(3, pages.length),
        scales: [0.64, 0.58, 0.52, 0.48],
        minQuality: 0.34,
        maxQuality: 0.58,
      },
    ];

    async function evaluate(parts, scale, quality) {
      const q = Math.round(quality * 100) / 100;
      const jpegs = await encodePages(pages, scale, q);
      const sizes = jpegs.map((item) => item.bytes.length);
      const ranges = splitRanges(sizes, parts);
      const pdfs = ranges.map(([start, end]) =>
        buildPdf(jpegs, start, end),
      );
      return {
        fits: pdfs.every((pdf) => pdf.length <= maxBytes),
        pdfs,
        ranges,
        scale,
        quality: q,
      };
    }

    for (const profile of profiles) {
      if (profile.parts < 1) continue;

      for (const scale of profile.scales) {
        assertNotCancelled();

        const floor = await evaluate(
          profile.parts,
          scale,
          profile.minQuality,
        );
        if (!floor.fits) continue;

        let best = floor;
        let low = profile.minQuality;
        let high = profile.maxQuality;

        for (let round = 0; round < 5; round += 1) {
          const mid = Math.round(((low + high) / 2) * 100) / 100;
          if (mid <= low + 0.005) break;

          const candidate = await evaluate(
            profile.parts,
            scale,
            mid,
          );

          if (candidate.fits) {
            best = candidate;
            low = mid;
          } else {
            high = mid;
          }
        }

        return best;
      }
    }

    throw new Error(
      "This capture cannot fit inside the selected size limit while keeping a safe readability floor and maximum 3 PDFs. " +
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

  function safeHostName() {
    return (location.hostname || "capture")
      .replace(/[^a-z0-9.-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "capture";
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
        safeHostName() +
        "_" +
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

  async function captureAllPages(el, clipCss) {
    state.seamWarnings = 0;

    await waitVisibleImages(clipCss, 2200);
    await waitForLayout(el, 420, 2400);

    let firstFull = await captureClip(clipCss);
    let previousFull = firstFull;
    let previousBody = null;
    let lastFull = firstFull;
    let assembler = null;
    let fixed = { top: 0, bottom: 0 };
    let initialized = false;
    let shotCount = 1;
    let bodyCssHeight = clipCss.height;

    while (shotCount < 12000) {
      assertNotCancelled();

      const freshClip = currentClipCss();
      const stepCss = Math.max(
        80,
        Math.floor(
          initialized
            ? bodyCssHeight * 0.68
            : freshClip.height * 0.56,
        ),
      );

      const beforeTop = scrollTopOf(el);
      const movement = await advanceScroll(el, stepCss);

      if (movement.done) break;

      const afterTop = scrollTopOf(el);
      const deltaCss = Math.max(1, afterTop - beforeTop);

      await waitVisibleImages(freshClip, 2200);
      await waitForLayout(el, 340, 2200);
      await sleep(150);

      let currentFull = await captureClip(freshClip);

      const widthDrift =
        Math.abs(currentFull.width - firstFull.width) /
        Math.max(1, firstFull.width);
      if (widthDrift > 0.03) {
        throw new Error(
          "The selected area changed width during capture. Keep the window size/zoom stable and try again.",
        );
      }

      const scaleY =
        currentFull.height / Math.max(1, freshClip.height);

      if (!initialized) {
        fixed = detectFixedBands(firstFull, currentFull);

        const firstBody = extractCanvas(
          firstFull,
          fixed.top,
          fixed.bottom,
        );
        let currentBody = extractCanvas(
          currentFull,
          fixed.top,
          fixed.bottom,
        );

        assembler = createPageAssembler(firstBody);

        if (fixed.top > 0) {
          await assembler.add(
            extractCanvas(
              firstFull,
              0,
              firstFull.height - fixed.top,
            ),
          );
        }

        await assembler.add(firstBody);
        previousBody = firstBody;
        bodyCssHeight =
          firstBody.height / Math.max(0.01, scaleY);

        const expectedOverlap = Math.max(
          8,
          currentBody.height - deltaCss * scaleY,
        );
        let match = findOverlap(
          previousBody,
          currentBody,
          expectedOverlap,
        );

        if (!match.confident) {
          await sleep(620);
          await waitForLayout(el, 320, 1900);
          const retryFull = await captureClip(freshClip);
          const retryBody = extractCanvas(
            retryFull,
            fixed.top,
            fixed.bottom,
          );
          const retryMatch = findOverlap(
            previousBody,
            retryBody,
            expectedOverlap,
          );

          if (retryMatch.score < match.score) {
            currentFull = retryFull;
            currentBody = retryBody;
            match = retryMatch;
          }

          if (!match.confident) state.seamWarnings += 1;
        }

        await assembler.add(
          cropCanvas(currentBody, match.overlap),
        );

        previousBody = currentBody;
        previousFull = currentFull;
        lastFull = currentFull;
        initialized = true;
        shotCount += 1;
      } else {
        let currentBody = extractCanvas(
          currentFull,
          fixed.top,
          fixed.bottom,
        );

        const expectedOverlap = Math.max(
          8,
          currentBody.height - deltaCss * scaleY,
        );
        let match = findOverlap(
          previousBody,
          currentBody,
          expectedOverlap,
        );

        if (!match.confident) {
          await sleep(620);
          await waitForLayout(el, 320, 1900);
          const retryFull = await captureClip(freshClip);
          const retryBody = extractCanvas(
            retryFull,
            fixed.top,
            fixed.bottom,
          );
          const retryMatch = findOverlap(
            previousBody,
            retryBody,
            expectedOverlap,
          );

          if (retryMatch.score < match.score) {
            currentFull = retryFull;
            currentBody = retryBody;
            match = retryMatch;
          }

          if (!match.confident) state.seamWarnings += 1;
        }

        await assembler.add(
          cropCanvas(currentBody, match.overlap),
        );

        previousBody = currentBody;
        previousFull = currentFull;
        lastFull = currentFull;
        shotCount += 1;
      }

      const s = snapshot(el, "bottom");
      const percent =
        s.max > 1
          ? clamp((s.top / s.max) * 100, 0, 100)
          : 100;

      setStatus(
        "Capturing… " +
          percent.toFixed(1) +
          "% · " +
          shotCount +
          " frames" +
          (fixed.top || fixed.bottom
            ? " · fixed bars cleaned"
            : "") +
          (state.seamWarnings
            ? " · " +
              state.seamWarnings +
              " seam fallback(s)"
            : ""),
      );
    }

    if (!initialized) {
      assembler = createPageAssembler(firstFull);
      await assembler.add(firstFull);
    } else if (fixed.bottom > 0) {
      await assembler.add(
        extractCanvas(
          lastFull,
          lastFull.height - fixed.bottom,
          0,
        ),
      );
    }

    const pages = await assembler.finish();

    // Release the last large frame canvases as soon as the page sources are encoded.
    for (const frame of [firstFull, previousFull, previousBody, lastFull]) {
      try {
        if (frame) {
          frame.width = 1;
          frame.height = 1;
        }
      } catch (_) {}
    }

    return {
      pages,
      fixed,
      shotCount,
    };
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

    try {
      assertTargetUsable(state.target);
    } catch (error) {
      setStatus(String(error?.message || error));
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
    cancelButton.style.display = "inline-block";

    const el = state.target;
    state.originalScrollTop = scrollTopOf(el);
    state.originalScrollBehavior = el.style?.scrollBehavior || "";
    let unfreeze = () => {};

    try {
      if (el.style) el.style.scrollBehavior = "auto";
      unfreeze = installCaptureFreeze(el);

      if (rangeSelect.value === "full") {
        await loadAllTheWayToTop(el);
      }

      assertNotCancelled();
      setStatus("Starting clean capture…");

      const finalClip = currentClipCss();
      const capture = await captureAllPages(el, finalClip);

      assertNotCancelled();
      setStatus(
        "Capture complete · " +
          capture.shotCount +
          " frames · " +
          capture.pages.length +
          " A4 page source(s). Optimizing…",
      );

      const maxBytes = Math.floor(maxMb * 1000000);
      const result = await fitPdfs(
        capture.pages,
        maxBytes,
      );

      assertNotCancelled();
      setStatus(
        "Saving " +
          result.pdfs.length +
          " PDF file(s)…",
      );
      await downloadPdfs(result);

      const sizeText = result.pdfs
        .map(
          (pdf) =>
            (pdf.length / 1000000).toFixed(2) +
            " MB",
        )
        .join(" · ");

      setStatus(
        "Done · " +
          result.pdfs.length +
          " PDF(s) · " +
          sizeText +
          " · " +
          Math.round(result.scale * 100) +
          "% / q" +
          Math.round(result.quality * 100) +
          (state.seamWarnings
            ? " · " +
              state.seamWarnings +
              " seam(s) used measured-scroll fallback; review once."
            : " · seams matched cleanly."),
      );
    } catch (error) {
      setStatus(String(error?.message || error));
    } finally {
      try {
        unfreeze();
      } catch (_) {}

      try {
        setScrollTop(el, state.originalScrollTop);
        if (el.style) {
          el.style.scrollBehavior =
            state.originalScrollBehavior;
        }
      } catch (_) {}

      state.captureRunning = false;
      state.cancelled = false;

      captureButton.disabled = false;
      cropButton.disabled = false;
      parentButton.disabled =
        !scrollableParent(state.target);
      reselectButton.disabled = false;
      rangeSelect.disabled = false;
      maxMbInput.disabled = false;
      cancelButton.style.display = "none";
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

  function onRuntimeMessage(message) {
    if (message?.type === "SHOTDOWN_ACTIVATE") activate();
  }

  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  window.__shotdownCleanup = () => {
    try {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      host?.remove();
    } catch (_) {}
    delete window.__shotdownCleanup;
    delete window.__shotdownVersion;
    window.__shotdownInstalled = false;
  };
})();
