// Chess Coach — fair-play guard (content script)
// Runs on chess.com pages. It NEVER reads the board, never injects an overlay,
// and never extracts move data from a live game. Its only job is to tell the
// extension "a live game is on screen right now" so the side panel can warn the
// user and stay in study mode.
(function () {
  'use strict';

  var livePatterns = [
    /^\/play(\/|$)/,          // live chess board
    /^\/game\/live(\/|$)/,    // live game pages
    /^\/play\/computer/,      // vs computer
    /^\/analysis(\/|$)/       // interactive analysis of a live position
  ];

  function isLiveContext() {
    var path = location.pathname;
    for (var i = 0; i < livePatterns.length; i++) if (livePatterns[i].test(path)) return true;
    // Conservative DOM hint: the live board container is only present on /play.
    if (document.querySelector('wc-chess-board, .board.mod-live, chess-board')) {
      if (/^\/game\/live/.test(path)) return true;
    }
    return false;
  }

  function report(live) {
    try {
      chrome.runtime.sendMessage({ type: 'live-game-detected', live: live, url: location.href });
    } catch (e) { /* extension context may be invalidated on reload */ }
  }

  var last = null;
  function check() {
    var live = isLiveContext();
    if (live !== last) { last = live; report(live); }
  }

  check();
  window.addEventListener('popstate', check);
  // chess.com is a SPA; watch for route changes without touching game state.
  var obs = new MutationObserver(function () { check(); });
  try { obs.observe(document.body, { childList: true, subtree: false }); } catch (e) {}
  setInterval(check, 4000);
})();
