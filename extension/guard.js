// Chess Coach — fair-play guard (content script)
//
// Runs on chess.com. It deliberately does NOT read the board, inject an
// overlay, extract move data, or talk to any game endpoint. Its only job is to
// answer one question — "is a live board on screen?" — so the side panel can
// lock analysis while a game is in progress.
(function () {
  'use strict';

  var STRICT = [/^\/play(\/|$)/, /^\/game\/live(\/|$)/, /^\/analysis(\/|$)/, /^\/play\/computer/];
  var LOOSE = [/^\/play(\/|$)/, /^\/game\/live(\/|$)/];

  function isLive(strict) {
    var patterns = strict ? STRICT : LOOSE;
    var path = location.pathname;
    for (var i = 0; i < patterns.length; i++) if (patterns[i].test(path)) return true;
    // A live board element on a game URL is a second signal, never a data read.
    if (/^\/game\/live/.test(path) && document.querySelector('wc-chess-board, chess-board')) return true;
    return false;
  }

  var last = null;

  function report(live) {
    try {
      chrome.runtime.sendMessage({ type: 'live-game-detected', live: live, url: location.href });
    } catch (e) { /* extension reloaded — nothing to do */ }
  }

  function check() {
    // Default to the strict pattern; the panel can relax it via storage.
    var live = isLive(true);
    if (live !== last) { last = live; report(live); }
  }

  check();
  window.addEventListener('popstate', check);
  window.addEventListener('hashchange', check);
  // chess.com is a single-page app: watch for route changes, not game state.
  try { new MutationObserver(check).observe(document.body, { childList: true, subtree: false }); } catch (e) {}
  setInterval(check, 3000);
})();
