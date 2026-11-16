/* Chess Coach — app logic (shared by web app and browser extension) */
(function () {
  'use strict';
  var C = window.ChessCore;
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var $ = function (id) { return document.getElementById(id); };

  // ---- state ----
  var baseFen = C.START_FEN;   // position the game starts from
  var fullSans = [];           // every move of the game (SAN)
  var viewPly = -1;            // which move is on the board (-1 = base position)
  var game = new C.Game(baseFen);
  var flipped = false, selected = -1, bestArrow = null;
  var annotations = {};        // ply index -> {tag, loss, best}
  var reviewRunning = false;

  var boardEl = $('board');
  var log = function (m) { if (window.console) console.log('[coach]', m); };

  // ---- position helpers ----
  function rebuild() {
    game = new C.Game(baseFen);
    var n = Math.min(viewPly, fullSans.length - 1);
    for (var i = 0; i <= n; i++) {
      try { game.moveSAN(fullSans[i]); } catch (e) { log('replay failed at ' + i + ': ' + e.message); break; }
    }
    selected = -1;
    render();
  }
  function setBase(fen, sans) {
    baseFen = fen || C.START_FEN;
    fullSans = sans ? sans.slice() : [];
    viewPly = fullSans.length - 1;
    annotations = {};
    bestArrow = null;
    rebuild();
  }
  function goTo(ply) {
    viewPly = Math.max(-1, Math.min(ply, fullSans.length - 1));
    bestArrow = null;
    rebuild();
  }
  function lastMove() {
    return game.history.length ? game.history[game.history.length - 1].move : null;
  }

  // ---- board rendering ----
  function screenIndex(s) {
    var r = Math.floor(s / 8), f = s % 8;
    if (flipped) { r = 7 - r; f = 7 - f; }
    return r * 8 + f;
  }
  function render() {
    var legal = game.legalMoves();
    var selMoves = selected >= 0 ? legal.filter(function (m) { return m.from === selected; }) : [];
    var chk = C.inCheck(game.pos, game.pos.turn);
    var kingSq = -1;
    if (chk) {
      for (var i = 0; i < 64; i++) {
        var p = game.pos.board[i];
        if (p && p.t === 'k' && p.c === game.pos.turn) kingSq = i;
      }
    }
    var lm = lastMove();
    boardEl.innerHTML = '';
    for (var s = 0; s < 64; s++) {
      var idx = screenIndex(s);
      var r = Math.floor(idx / 8), f = idx % 8;
      var sq = document.createElement('div');
      sq.className = 'sq ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.idx = idx;
      var piece = game.pos.board[idx];
      if (piece) {
        var span = document.createElement('span');
        span.textContent = GLYPH[piece.t];
        span.style.color = piece.c === 'w' ? '#fff' : '#111';
        span.style.textShadow = piece.c === 'w' ? '0 0 3px #000, 0 2px 3px rgba(0,0,0,.6)' : '0 0 3px #fff';
        sq.appendChild(span);
      }
      if (idx === selected) sq.classList.add('sel');
      if (lm && (idx === lm.from || idx === lm.to)) sq.classList.add('last');
      if (idx === kingSq) sq.classList.add('check');
      for (var k = 0; k < selMoves.length; k++) {
        if (selMoves[k].to === idx) {
          var d = document.createElement('div');
          d.className = (selMoves[k].captured || (selMoves[k].flags && selMoves[k].flags.ep)) ? 'ring' : 'dot';
          sq.appendChild(d);
        }
      }
      sq.addEventListener('click', onSquare);
      boardEl.appendChild(sq);
    }
    drawArrow();
    renderMoves();
    var st = game.status();
    $('status').textContent =
      st === 'checkmate' ? 'Checkmate — ' + (game.winner() === 'w' ? 'White' : 'Black') + ' wins' :
      st === 'stalemate' ? 'Stalemate — draw' :
      st === 'draw' ? 'Draw' :
      st === 'check' ? 'Check' :
      (game.pos.turn === 'w' ? 'White' : 'Black') + ' to move' +
        (viewPly < fullSans.length - 1 ? ' · reviewing move ' + (viewPly + 1) + '/' + fullSans.length : '');
    var op = C.lookupOpening(fullSans.slice(0, viewPly + 1));
    $('opening').textContent = op ? 'Opening: ' + op.name : '';
  }

  function drawArrow() {
    var svg = $('arrows');
    if (!svg) return;
    svg.innerHTML = '';
    if (!bestArrow) return;
    function pt(i) {
      var s = screenIndex(i);
      return [(s % 8) * 100 + 50, Math.floor(s / 8) * 100 + 50];
    }
    var a = pt(bestArrow.from), b = pt(bestArrow.to);
    var mk = function (tag, attrs) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (var key in attrs) el.setAttribute(key, attrs[key]);
      svg.appendChild(el);
    };
    mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'rgba(21,128,61,.85)', 'stroke-width': 16, 'stroke-linecap': 'round' });
    mk('circle', { cx: a[0], cy: a[1], r: 10, fill: 'rgba(21,128,61,.85)' });
    mk('circle', { cx: b[0], cy: b[1], r: 16, fill: 'rgba(21,128,61,.85)' });
  }

  function renderMoves() {
    var html = '';
    for (var i = 0; i < fullSans.length; i++) {
      if (i % 2 === 0) html += '<span style="color:#a8a29e">' + (i / 2 + 1) + '.</span> ';
      var a = annotations[i];
      var cls = 'mv' + (i === viewPly ? ' cur' : '') + (i > viewPly ? ' future' : '');
      var mark = a ? '<sup title="' + a.best + ' was better">' + (a.tag === 'blunder' ? '??' : a.tag === 'mistake' ? '?' : '?!') + '</sup>' : '';
      html += '<span class="' + cls + '" data-ply="' + i + '">' + fullSans[i] + mark + '</span> ';
    }
    var el = $('moves');
    el.innerHTML = html || '<span style="color:#a8a29e">No moves yet — click a piece to move, or load a PGN.</span>';
    el.querySelectorAll('[data-ply]').forEach(function (n) {
      n.addEventListener('click', function () { goTo(parseInt(n.dataset.ply, 10)); });
    });
    el.scrollTop = el.scrollHeight;
  }

  // ---- interaction ----
  var pendingPromo = null;
  function onSquare(e) {
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var legal = game.legalMoves();
    if (selected >= 0) {
      var cands = legal.filter(function (m) { return m.from === selected && m.to === idx; });
      if (cands.length > 1 && cands[0].promotion) {
        pendingPromo = cands;
        $('promoModal').classList.remove('hidden');
        return;
      }
      if (cands.length === 1) { playMove(cands[0]); return; }
    }
    var piece = game.pos.board[idx];
    selected = (piece && piece.c === game.pos.turn) ? idx : -1;
    render();
  }
  function playMove(m) {
    if (viewPly < fullSans.length - 1) fullSans = fullSans.slice(0, viewPly + 1);
    var san;
    try { san = game.moveObj(m); } catch (e) { log(e.message); return; }
    fullSans.push(san);
    viewPly = fullSans.length - 1;
    selected = -1;
    bestArrow = null;
    annotations = {};
    render();
    $('topMoves').innerHTML = '';
  }
  (function bindPromo() {
    var modal = $('promoModal');
    if (!modal) return;
    modal.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = pendingPromo.filter(function (x) { return x.promotion === b.dataset.p; })[0];
        modal.classList.add('hidden');
        pendingPromo = null;
        if (m) playMove(m);
      });
    });
  })();

  $('btnNew').addEventListener('click', function () {
    setBase(C.START_FEN, []);
    $('topMoves').innerHTML = '';
    $('evalFill').style.height = '50%';
    $('evalText').textContent = '0.0';
  });
  $('btnFlip').addEventListener('click', function () { flipped = !flipped; render(); });
  $('btnUndo').addEventListener('click', function () {
    if (viewPly < 0) return;
    fullSans = fullSans.slice(0, viewPly);
    viewPly = fullSans.length - 1;
    annotations = {};
    bestArrow = null;
    rebuild();
  });
  $('btnPrev').addEventListener('click', function () { goTo(viewPly - 1); });
  $('btnNext').addEventListener('click', function () { goTo(viewPly + 1); });
  $('btnStart').addEventListener('click', function () { goTo(-1); });
  $('btnEnd').addEventListener('click', function () { goTo(fullSans.length - 1); });

  document.addEventListener('keydown', function (e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) >= 0) return;
    if (e.key === 'ArrowLeft') { goTo(viewPly - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { goTo(viewPly + 1); e.preventDefault(); }
    if (e.key === 'ArrowUp') { goTo(-1); e.preventDefault(); }
    if (e.key === 'ArrowDown') { goTo(fullSans.length - 1); e.preventDefault(); }
  });

  $('btnFen').addEventListener('click', function () {
    try {
      var fen = $('fenInput').value.trim();
      new C.Game(fen);              // validate
      setBase(fen, []);
    } catch (e) { alert(e.message); }
  });
  var copyBtn = $('btnCopyFen');
  if (copyBtn) copyBtn.addEventListener('click', function () { navigator.clipboard.writeText(game.fen()); });
  $('btnPgn').addEventListener('click', function () {
    try {
      var r = C.parsePGN($('pgnInput').value);
      setBase(C.START_FEN, r.sans);
      if (r.headers && (r.headers.White || r.headers.Black)) {
        $('pgnInput').value = C.toPGN(game, r.headers);
      }
    } catch (e) { alert('Could not read that PGN: ' + e.message); }
  });
  var expPgn = $('btnExportPgn');
  if (expPgn) expPgn.addEventListener('click', function () { $('pgnInput').value = C.toPGN(game); });

  // ---- engine analysis of current position ----
  function showEval(score) {
    var pawns = score / 100;
    var pct = 50 + 50 * (2 / (1 + Math.exp(-0.004 * score)) - 1);
    $('evalFill').style.height = pct + '%';
    $('evalText').textContent = (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
  }
  $('btnAnalyze').addEventListener('click', function () {
    var depth = parseInt($('depthSel').value, 10);
    $('topMoves').innerHTML = 'Thinking…';
    setTimeout(function () {
      var res = C.findBestMoves(game.pos, depth);
      showEval(res.whiteScore);
      if (res.moves[0]) bestArrow = res.moves[0].move;
      $('topMoves').innerHTML = res.moves.map(function (m, i) {
        return '<div>' + (i + 1) + '. <b>' + m.san + '</b> <span style="color:#a8a29e">(' +
          (m.score / 100).toFixed(2) + ')</span></div>';
      }).join('') + '<div class="small">depth ' + res.depth + ' · ' + res.nodes + ' nodes</div>';
      render();
    }, 20);
  });

  // ---- full game review: per-move centipawn loss ----
  function reviewGame() {
    if (reviewRunning) return;
    if (!fullSans.length) { $('reviewInfo').textContent = 'Load a game first.'; return; }
    reviewRunning = true;
    annotations = {};
    var i = -1, results = [];
    $('btnReview').disabled = true;
    $('reviewInfo').textContent = 'Reviewing…';
    function step() {
      i++;
      if (i >= fullSans.length) { finish(); return; }
      var g2 = new C.Game(baseFen);
      for (var k = 0; k < i; k++) g2.moveSAN(fullSans[k]);
      var side = g2.pos.turn;
      var best = C.findBestMoves(g2.pos, 2);
      g2.moveSAN(fullSans[i]);
      var after = C.findBestMoves(g2.pos, 2);
      // best score for the mover, in centipawns from mover's perspective
      var bestForMover = side === 'w' ? best.whiteScore : -best.whiteScore;
      var afterForMover = side === 'w' ? -after.whiteScore : after.whiteScore;
      var loss = Math.max(0, bestForMover - afterForMover);
      results.push({ ply: i, san: fullSans[i], loss: loss, best: best.moves[0] ? best.moves[0].san : '—' });
      if (loss >= 150) annotations[i] = { tag: 'blunder', loss: loss, best: best.moves[0] ? best.moves[0].san : '—' };
      else if (loss >= 70) annotations[i] = { tag: 'mistake', loss: loss, best: best.moves[0] ? best.moves[0].san : '—' };
      else if (loss >= 30) annotations[i] = { tag: 'inaccuracy', loss: loss, best: best.moves[0] ? best.moves[0].san : '—' };
      $('reviewInfo').textContent = 'Reviewing… ' + (i + 1) + '/' + fullSans.length;
      renderMoves();
      setTimeout(step, 0);
    }
    function finish() {
      var blunders = results.filter(function (r) { return r.loss >= 150; }).length;
      var mistakes = results.filter(function (r) { return r.loss >= 70 && r.loss < 150; }).length;
      var inacc = results.filter(function (r) { return r.loss >= 30 && r.loss < 70; }).length;
      var avg = results.reduce(function (a, r) { return a + r.loss; }, 0) / Math.max(1, results.length);
      $('reviewInfo').innerHTML = '<b>Review:</b> ' + results.length + ' moves · ' +
        blunders + ' blunder' + (blunders === 1 ? '' : 's') + ' · ' +
        mistakes + ' mistake' + (mistakes === 1 ? '' : 's') + ' · ' +
        inacc + ' inaccurac' + (inacc === 1 ? 'y' : 'ies') +
        ' · avg loss ' + (avg / 100).toFixed(2) + ' pawns' +
        '<br><span class="small">Shallow (depth 2) built-in engine — good for spotting big swings, not a full engine report.</span>';
      $('btnReview').disabled = false;
      reviewRunning = false;
      renderMoves();
    }
    step();
  }
  var rv = $('btnReview');
  if (rv) rv.addEventListener('click', reviewGame);

  // ---- AI coach ----
  var SETTINGS_KEY = 'chesscoach.settings';
  var storage = {
    get: function (cb) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([SETTINGS_KEY], function (o) { cb(o[SETTINGS_KEY] || {}); });
      } else {
        try { cb(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { cb({}); }
      }
    },
    set: function (v) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        var o = {}; o[SETTINGS_KEY] = v;
        chrome.storage.local.set(o);
      } else {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));
      }
    }
  };
  var settings = {};
  function readForm() {
    return {
      provider: $('setProvider').value,
      model: $('setModel').value.trim(),
      key: $('setKey').value.trim(),
      base: $('setBase').value.trim(),
      temp: parseFloat($('setTemp').value),
      sys: $('setSys').value
    };
  }
  $('btnSaveSettings').addEventListener('click', function () {
    settings = readForm();
    storage.set(settings);
    $('settingsMsg').textContent = 'Saved ✓';
    setTimeout(function () { $('settingsMsg').textContent = ''; }, 2000);
  });
  storage.get(function (s) {
    settings = s || {};
    if (s.provider) $('setProvider').value = s.provider;
    if (s.model) $('setModel').value = s.model;
    if (s.key) $('setKey').value = s.key;
    if (s.base) $('setBase').value = s.base;
    if (s.temp != null) { $('setTemp').value = s.temp; $('tempVal').textContent = s.temp; }
    if (s.sys) $('setSys').value = s.sys;
  });
  $('setTemp').addEventListener('input', function () { $('tempVal').textContent = this.value; });

  function addMsg(text, who) {
    var d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    return d;
  }

  function positionContext() {
    var r = C.findBestMoves(game.pos, 2);
    return 'Position FEN: ' + game.fen() +
      '\nMoves so far: ' + (fullSans.slice(0, viewPly + 1).join(' ') || '(none)') +
      '\nSide to move: ' + (game.pos.turn === 'w' ? 'White' : 'Black') +
      '\nBuilt-in engine (depth 2) eval, white POV: ' + (r.whiteScore / 100).toFixed(2) +
      '\nBuilt-in engine top moves: ' + r.moves.map(function (m) { return m.san; }).join(', ');
  }

  async function askCoach(question) {
    if (!settings.key) {
      addMsg('Add an API key under ⚙️ Coach settings first. The Analyze and Review buttons use the built-in engine and need no key.', 'ai');
      return;
    }
    var ctx = positionContext();
    var bubble = addMsg('Thinking…', 'ai');
    try {
      var reply;
      if (settings.provider === 'anthropic') {
        var r1 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: settings.model || 'claude-sonnet-4-5',
            max_tokens: 900,
            temperature: settings.temp != null && !isNaN(settings.temp) ? settings.temp : 0.7,
            system: settings.sys,
            messages: [{ role: 'user', content: ctx + '\n\nQuestion: ' + question }]
          })
        });
        var j1 = await r1.json();
        reply = j1.content && j1.content[0] ? j1.content[0].text : 'Error: ' + JSON.stringify(j1);
      } else {
        var base = (settings.provider === 'custom' && settings.base)
          ? settings.base.replace(/\/+$/, '')
          : 'https://api.openai.com/v1';
        var r2 = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.key },
          body: JSON.stringify({
            model: settings.model || 'gpt-4o-mini',
            temperature: settings.temp != null && !isNaN(settings.temp) ? settings.temp : 0.7,
            messages: [
              { role: 'system', content: settings.sys },
              { role: 'user', content: ctx + '\n\nQuestion: ' + question }
            ]
          })
        });
        var j2 = await r2.json();
        reply = j2.choices && j2.choices[0] ? j2.choices[0].message.content : 'Error: ' + JSON.stringify(j2);
      }
      bubble.textContent = reply;
    } catch (e) {
      bubble.textContent = 'Request failed: ' + e.message + ' — check your key, model name, and connection.';
    }
  }
  $('btnSend').addEventListener('click', function () {
    var q = $('chatInput').value.trim();
    if (!q) return;
    addMsg(q, 'user');
    $('chatInput').value = '';
    askCoach(q);
  });
  $('chatInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btnSend').click(); });

  // ---- Chess.com official public API import ----
  var cc = $('btnCcLoad');
  if (cc) cc.addEventListener('click', async function () {
    var user = $('ccUser').value.trim();
    if (!user) return;
    $('ccInfo').textContent = 'Loading…';
    try {
      var aRes = await fetch('https://api.chess.com/pub/player/' + encodeURIComponent(user.toLowerCase()) + '/games/archives');
      if (aRes.status === 404) throw new Error('No such Chess.com player.');
      if (!aRes.ok) throw new Error('HTTP ' + aRes.status);
      var arch = await aRes.json();
      if (!arch.archives || !arch.archives.length) throw new Error('That account has no public game archives.');
      var latest = arch.archives[arch.archives.length - 1];
      var gRes = await fetch(latest);
      var gJson = await gRes.json();
      if (!gJson.games || !gJson.games.length) throw new Error('No games in the latest archive month.');
      var last = gJson.games[gJson.games.length - 1];
      var parsed = C.parsePGN(last.pgn);
      $('pgnInput').value = last.pgn;
      setBase(C.START_FEN, parsed.sans);
      var w = (last.white && last.white.username) || '?';
      var b = (last.black && last.black.username) || '?';
      var res = (last.white && last.white.result ? last.white.result : '?') + ' / ' +
                (last.black && last.black.result ? last.black.result : '?');
      $('ccInfo').textContent = 'Loaded ' + w + ' vs ' + b + ' · ' + res + ' · ' + parsed.sans.length +
        ' moves. Use ← → to step through, or Review to find blunders.';
    } catch (e) {
      $('ccInfo').textContent = 'Import failed: ' + e.message;
    }
  });

  // hook for the extension panel extras
  window.ChessCoach = {
    loadPGN: function (text) {
      var r = C.parsePGN(text);
      setBase(C.START_FEN, r.sans);
      return r;
    },
    goTo: goTo,
    addMsg: addMsg,
    getGame: function () { return game; }
  };

  rebuild();
})();
