chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/i.test(tab.url || "")) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    await chrome.tabs.sendMessage(tab.id, { type: "SHOTDOWN_ACTIVATE" });
  } catch (error) {
    console.error("Shotdown could not start on this page:", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SHOTDOWN_CAPTURE_VISIBLE") {
    chrome.tabs
      .captureVisibleTab(sender.tab?.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) }),
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
        sendResponse({ ok: false, error: String(error?.message || error) }),
      );
    return true;
  }
});
