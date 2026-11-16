// Chess Coach — background service worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'live-game-detected') {
    // The guard tells us a live game tab is open. Nothing to do but remember the
    // state so the panel can show a fair-play notice — we never fetch game data
    // from an in-progress game.
    chrome.storage.session.set({ liveGameDetected: true, liveGameTab: sender.tab ? sender.tab.id : null })
      .catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === 'get-live-state') {
    chrome.storage.session.get(['liveGameDetected']).then((v) => sendResponse(v)).catch(() => sendResponse({}));
    return true;
  }
});
