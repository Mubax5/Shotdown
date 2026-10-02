const captureQueues = new Map();
const lastCaptureAt = new Map();
const MIN_CAPTURE_INTERVAL_MS = 620;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showTemporaryBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }, 1800);
  } catch (_) {}
}

async function ensureSenderTabIsActive(sender) {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;

  if (!tabId || windowId == null) {
    throw new Error("Shotdown could not identify the source tab.");
  }

  const [tab, activeTabs] = await Promise.all([
    chrome.tabs.get(tabId),
    chrome.tabs.query({ active: true, windowId }),
  ]);

  if (!tab.active || !activeTabs.length || activeTabs[0].id !== tabId) {
    throw new Error(
      "Keep the Shotdown tab active and visible while capture is running.",
    );
  }

  return { tabId, windowId };
}

function queueCapture(windowId, task) {
  const previous = captureQueues.get(windowId) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (captureQueues.get(windowId) === next) {
        captureQueues.delete(windowId);
      }
    });

  captureQueues.set(windowId, next);
  return next;
}

async function captureVisibleForSender(sender) {
  const { windowId } = await ensureSenderTabIsActive(sender);

  return queueCapture(windowId, async () => {
    const now = Date.now();
    const last = lastCaptureAt.get(windowId) || 0;
    const wait = Math.max(0, MIN_CAPTURE_INTERVAL_MS - (now - last));

    if (wait) await sleep(wait);

    await ensureSenderTabIsActive(sender);

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "png",
    });

    lastCaptureAt.set(windowId, Date.now());
    return dataUrl;
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/i.test(tab.url || "")) {
    if (tab.id) {
      await showTemporaryBadge(tab.id, "!", "#5f6368");
    }
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["core.js", "content.js"],
    });

    await chrome.tabs.sendMessage(tab.id, { type: "SHOTDOWN_ACTIVATE" });
  } catch (error) {
    console.error("Shotdown could not start on this page:", error);
    await showTemporaryBadge(tab.id, "!", "#5f6368");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SHOTDOWN_CAPTURE_VISIBLE") {
    captureVisibleForSender(sender)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: String(error?.message || error),
        }),
      );
    return true;
  }

  if (message?.type === "SHOTDOWN_DOWNLOAD") {
    chrome.downloads
      .download({
        url: message.dataUrl,
        filename: message.filename,
        saveAs: false,
        conflictAction: "uniquify",
      })
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: String(error?.message || error),
        }),
      );
    return true;
  }
});
