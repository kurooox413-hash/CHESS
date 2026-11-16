// Chess Coach — side panel extras (fair-play notice)
(function () {
  'use strict';
  var notice = document.getElementById('liveNotice');
  if (!notice) return;

  function apply(state) {
    var live = !!(state && state.liveGameDetected);
    notice.style.display = live ? 'block' : 'none';
    ['btnAnalyze', 'btnReview', 'btnSend'].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.disabled = live;
      b.title = live ? 'Disabled while a live game tab is open (fair play)' : '';
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'get-live-state' }, function (s) { apply(s); });
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'session' && changes.liveGameDetected) {
          apply({ liveGameDetected: changes.liveGameDetected.newValue });
        }
      });
    }
  }
})();
