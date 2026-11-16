/* Chess Coach — application logic (shared by web app and extension) */
(function () {
  'use strict';

  var C = window.ChessCore;
  var S = window.ChessCoachSettings;
  var GLYPH = {
    solid: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
    unicode: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    outline: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }
  };
  var $ = function (id) { return document.getElementById(id); };
  // Bind only if the element exists — the web app and the extension panel have
  // slightly different shells but share this script.
  var on = function (id, evt, fn) {
    var node = typeof id === 'string' ? $(id) : id;
    if (node) node.addEventListener(evt, fn);
    return node;
  };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ------------------------------------------------------------- state
  var settings = S.normalise({});
  var baseFen = C.START_FEN;
  var fullSans = [];
  var startHeaders = {};
  var viewPly = -1;
  var game = new C.Game(baseFen);
  var flipped = false;
  var selected = -1;
  var hoverSq = -1;
  var bestArrow = null;
  var extraArrows = [];
  var review = null;          // result of C.reviewGame
  var reviewIdx = -1;
  var reviewRunning = false;
  var chatHistory = [];       // {role, content}
  var lastAnalysis = null;
  var liveGame = false;
  var searchSeq = 0;

  var KEY_SETTINGS = 'chesscoach.settings.v2';
  var KEY_GAMES = 'chesscoach.games.v1';
  var KEY_SESSION = 'chesscoach.session.v1';
  var KEY_CACHE = 'chesscoach.cache.v1';

  // ------------------------------------------------------------- storage
  var store = {
    available: true,
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { store.available = false; return false; }
    },
    del: function (key) { try { window.localStorage.removeItem(key); } catch (e) {} },
    keys: function () {
      var out = [];
      try { for (var i = 0; i < window.localStorage.length; i++) out.push(window.localStorage.key(i)); } catch (e) {}
      return out;
    }
  };

  var usingChromeStorage = false;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    usingChromeStorage = true;
    var chromeGet = function (key) {
      return new Promise(function (resolve) {
        chrome.storage.local.get([key], function (o) { resolve(o ? o[key] : undefined); });
      });
    };
    var chromeSet = function (key, value) {
      return new Promise(function (resolve) {
        var o = {}; o[key] = value;
        chrome.storage.local.set(o, function () { resolve(); });
      });
    };
    store.asyncGet = chromeGet;
    store.asyncSet = chromeSet;
  }

  // ------------------------------------------------------------- settings
  function loadSettings() {
    if (usingChromeStorage) {
      chromeGet(KEY_SETTINGS).then(function (v) { applySettings(S.normalise(v || {})); });
    } else {
      applySettings(S.normalise(store.get(KEY_SETTINGS, {})));
    }
  }

  function saveSettings(silent) {
    if (settings.sessionOnlyKey && settings.apiKey) {
      // Keep the key out of persistent storage but keep everything else.
      var copy = Object.assign({}, settings); copy.apiKey = '';
      persist(copy);
    } else {
      persist(settings);
    }
    if (!silent) toast('Settings saved');
  }
  function persist(value) {
    if (usingChromeStorage) chromeSet(KEY_SETTINGS, value);
    else store.set(KEY_SETTINGS, value);
  }

  // Every visual setting is applied here. Called on load and on every change.
  function applySettings(s) {
    settings = S.normalise(s);
    var theme = S.themes[settings.boardTheme] || S.themes.brown;
    var light = theme.light, dark = theme.dark;
    if (settings.colorblindSafe) {
      light = S.themes.colorblind.light; dark = S.themes.colorblind.dark;
    }
    var root = document.documentElement;
    root.style.setProperty('--sq-light', light);
    root.style.setProperty('--sq-dark', dark);
    root.style.setProperty('--radius', '10px');
    root.style.setProperty('--board-radius', settings.borderRadius + 'px');
    root.style.setProperty('--piece-size', (settings.pieceSize / 100).toFixed(2));
    root.style.setProperty('--font-scale', (settings.fontScale / 100).toFixed(2));
    root.style.setProperty('--brightness', settings.boardBrightness / 100);
    root.style.setProperty('--contrast', settings.boardContrast / 100);
    document.body.dataset.theme = settings.appTheme;
    document.body.dataset.accent = settings.accent;
    document.body.dataset.font = settings.fontFamily;
    document.body.dataset.reduceMotion = settings.reduceMotion ? '1' : '0';
    document.body.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    document.body.dataset.focusRings = settings.focusRings ? '1' : '0';
    document.body.classList.toggle('large-targets', !!settings.largeClickTargets);

    var layout = document.querySelector('.layout');
    layout.className = 'layout density-' + settings.density;

    $('fairBanner').hidden = !settings.studyModeBanner;
    $('evalbar').hidden = !settings.showEvalBar || settings.evalBarSide === 'none';
    $('evalText').hidden = !settings.evalBarNumbers;
    var wrap = $('boardWrap');
    wrap.style.flexDirection = settings.evalBarSide === 'right' ? 'row-reverse' : 'row';
    $('board').classList.toggle('shadow', !!settings.boardShadow);
    $('coordRanks').style.display = settings.coordinates && !settings.coordinateOutside ? 'flex' : 'none';
    $('coordFiles').style.display = settings.coordinates && !settings.coordinateOutside ? 'flex' : 'none';
    $('openingCard').hidden = !settings.showOpeningName;
    $('movesCard').hidden = !settings.showMoveList;
    $('fenCard').hidden = !settings.showFenBox;
    $('status').hidden = !settings.showStatusBar;
    $('reviewSummaryCard').hidden = !settings.showReviewPanel;
    $('boardCol').classList.toggle('unstuck', !settings.stickyBoard);

    renderBoardChrome();
    syncQuickFields();
    renderSettings();
    updateDepthOptions();
    renderAll();
  }

  function set(id, value) {
    var field = S.byId[id];
    if (!field) return;
    settings[id] = S.coerce(field, value);
    var needsRerender = ['boardTheme', 'pieceSet', 'coordinates', 'appTheme', 'accent', 'fontScale',
      'density', 'fontFamily', 'highContrast', 'colorblindSafe', 'reduceMotion', 'largeClickTargets',
      'focusRings', 'studyModeBanner', 'showEvalBar', 'evalBarSide', 'evalBarNumbers',
      'boardBrightness', 'boardContrast', 'boardShadow', 'borderRadius', 'pieceSize',
      'coordinateOutside', 'showOpeningName', 'showMoveList', 'showFenBox', 'showStatusBar',
      'showReviewPanel', 'stickyBoard'].indexOf(id) >= 0;
    if (needsRerender) applySettings(settings);
    else renderAll();
    if (field.live) saveSettings(true);
  }

  // ------------------------------------------------------------- geometry
  function screenIndex(boardIdx) {
    var r = Math.floor(boardIdx / 8), f = boardIdx % 8;
    if (flipped) { r = 7 - r; f = 7 - f; }
    return r * 8 + f;
  }
  function fromScreen(screenIdx) {
    var r = Math.floor(screenIdx / 8), f = screenIdx % 8;
    if (flipped) { r = 7 - r; f = 7 - f; }
    return r * 8 + f;
  }

  // ------------------------------------------------------------- game view
  function rebuild() {
    game = new C.Game(baseFen);
    var target = Math.min(viewPly, fullSans.length - 1);
    for (var i = 0; i <= target; i++) {
      try { game.moveSAN(fullSans[i]); } catch (e) { break; }
    }
    selected = -1;
    renderAll();
  }
  function setGame(fen, sans, headers) {
    baseFen = fen || C.START_FEN;
    fullSans = (sans || []).slice();
    startHeaders = headers || {};
    viewPly = fullSans.length - 1;
    review = null;
    bestArrow = null;
    extraArrows = [];
    if (settings.startingSide === 'black') flipped = true;
    if (settings.startingSide === 'white') flipped = false;
    rebuild();
    persistSession();
    if (settings.autoReviewOnImport) runReview(true);
  }
  function goTo(ply) {
    viewPly = Math.max(-1, Math.min(ply, fullSans.length - 1));
    bestArrow = null;
    extraArrows = [];
    rebuild();
    if (settings.autoAnalyzeOnMove) runAnalysis(true);
    persistSession();
  }
  function currentMove() {
    return game.history.length ? game.history[game.history.length - 1].move : null;
  }

  function persistSession() {
    if (!settings.persistSession) return;
    store.set(KEY_SESSION, {
      fen: baseFen, sans: fullSans, viewPly: viewPly, headers: startHeaders, ts: Date.now()
    });
  }
  function restoreSession() {
    if (!settings.persistSession) return false;
    var s = store.get(KEY_SESSION, null);
    if (!s || !s.sans) return false;
    baseFen = s.fen || C.START_FEN;
    fullSans = s.sans;
    startHeaders = s.headers || {};
    viewPly = typeof s.viewPly === 'number' ? s.viewPly : fullSans.length - 1;
    rebuild();
    return true;
  }

  // ------------------------------------------------------------- rendering
  function myColour() {
    return null;
  }

  function renderBoardChrome() {
    var coordsAll = settings.coordsOnAllSquares;
    document.documentElement.style.setProperty('--coords-all', coordsAll ? '1' : '0');
  }

  function renderBoard() {
    var boardEl = $('board');
    var legal = game.legalMoves();
    var selMoves = selected >= 0 ? legal.filter(function (m) { return m.from === selected; }) : [];
    var chk = C.inCheck(game.pos, game.pos.turn);
    var kingSq = chk ? C.findKing(game.pos.board, game.pos.turn) : -1;
    var lm = currentMove();
    var glyphs = GLYPH[settings.pieceSet] || GLYPH.solid;
    var threatSquares = {};
    if (settings.threatOverlay) {
      for (var t = 0; t < 64; t++) {
        var pc = game.pos.board[t];
        if (pc && pc.c === game.pos.turn) {
          C.attackersOf(game.pos.board, t, pc.c === 'w' ? 'b' : 'w').forEach(function () {});
        }
      }
      // mark squares attacked by the opponent that hold our pieces
      for (var q = 0; q < 64; q++) {
        var piece = game.pos.board[q];
        if (piece && piece.c === game.pos.turn && C.isAttacked(game.pos.board, q, game.pos.turn === 'w' ? 'b' : 'w')) {
          threatSquares[q] = true;
        }
      }
    }

    boardEl.innerHTML = '';
    for (var s = 0; s < 64; s++) {
      var idx = fromScreen(s);
      var r = Math.floor(idx / 8), f = idx % 8;
      var sq = el('div', 'sq ' + ((r + f) % 2 === 0 ? 'light' : 'dark'));
      sq.dataset.idx = idx;
      sq.setAttribute('role', 'gridcell');
      var piece = game.pos.board[idx];
      if (piece) {
        var span = el('span', 'piece ' + (piece.c === 'w' ? 'white' : 'black') + (settings.pieceSet === 'outline' ? ' outline' : ''));
        span.textContent = glyphs[piece.t];
        sq.appendChild(span);
      }
      if (idx === selected) sq.classList.add('sel');
      if (lm && (idx === lm.from || idx === lm.to)) sq.classList.add('last', settings.lastMoveStyle);
      if (idx === kingSq && settings.highlightCheck) sq.classList.add('check');
      if (idx === hoverSq && settings.highlightHovered) sq.classList.add('hover');
      if (threatSquares[idx]) sq.classList.add('threat');
      if (settings.coordsOnAllSquares) {
        if (s % 8 === 0) sq.appendChild(el('span', 'coordR', String(8 - r)));
        if (s >= 56) sq.appendChild(el('span', 'coordF', 'abcdefgh'[f]));
      }
      for (var k = 0; k < selMoves.length; k++) {
        if (selMoves[k].to === idx) {
          var isCap = selMoves[k].captured || (selMoves[k].flags && selMoves[k].flags.ep);
          sq.appendChild(el('div', isCap && settings.showCaptureRings ? 'ring' : 'dot'));
          break;
        }
      }
      sq.addEventListener('click', onSquareClick);
      sq.addEventListener('mouseenter', function (e) {
        if (!settings.highlightHovered) return;
        hoverSq = parseInt(e.currentTarget.dataset.idx, 10);
        renderBoard();
      });
      boardEl.appendChild(sq);
    }
    if (settings.coordinates && !settings.coordinateOutside) {
      $('coordRanks').innerHTML = '';
      $('coordFiles').innerHTML = '';
      for (var i = 0; i < 8; i++) {
        $('coordRanks').appendChild(el('span', null, String(settings.mirrorOnFlip && flipped ? i + 1 : 8 - i)));
        $('coordFiles').appendChild(el('span', null, settings.mirrorOnFlip && flipped ? 'abcdefgh'[7 - i] : 'abcdefgh'[i]));
      }
    }
    drawArrows();
  }

  function arrowColour(i) {
    var map = { green: '#15803d', blue: '#1d4ed8', amber: '#b45309', purple: '#6d28d9' };
    if (settings.arrowColor === 'auto') return i === 0 ? map.green : i === 1 ? map.blue : map.amber;
    return map[settings.arrowColor] || map.green;
  }
  function drawArrows() {
    var svg = $('arrows');
    svg.innerHTML = '';
    var arrows = extraArrows.slice();
    if (bestArrow && settings.showBestArrow) arrows.unshift(bestArrow);
    if (!arrows.length) return;
    var width = settings.arrowStyle === 'thin' ? 9 : 15;
    var opacity = settings.arrowOpacity / 100;
    arrows.forEach(function (a, i) {
      if (!a) return;
      var from = screenIndex(a.from), to = screenIndex(a.to);
      var x1 = (from % 8) * 100 + 50, y1 = Math.floor(from / 8) * 100 + 50;
      var x2 = (to % 8) * 100 + 50, y2 = Math.floor(to / 8) * 100 + 50;
      var col = arrowColour(i);
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', col);
      line.setAttribute('stroke-width', i === 0 ? width : width * 0.7);
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', i === 0 ? opacity : opacity * 0.55);
      if (settings.arrowStyle === 'dotted') line.setAttribute('stroke-dasharray', '14 10');
      svg.appendChild(line);
      var head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      head.setAttribute('cx', x2); head.setAttribute('cy', y2);
      head.setAttribute('r', i === 0 ? 20 : 14);
      head.setAttribute('fill', col);
      head.setAttribute('opacity', i === 0 ? opacity : opacity * 0.55);
      svg.appendChild(head);
    });
  }

  function renderMoves() {
    var host = $('moves');
    if (!fullSans.length) {
      host.innerHTML = '<span class="muted">No moves yet — click a piece to move, or load a PGN.</span>';
      return;
    }
    host.innerHTML = '';
    for (var i = 0; i < fullSans.length; i++) {
      if (i % 2 === 0) host.appendChild(el('span', 'mvnum', (i / 2 + 1) + '. '));
      var mark = review && review.rows[i] ? review.rows[i].classification : null;
      var span = el('span', 'mv' + (i === viewPly ? ' cur' : '') + (i > viewPly ? ' future' : ''));
      span.dataset.ply = i;
      span.textContent = fullSans[i];
      if (mark && mark !== 'ok' && mark !== 'good') {
        var map = { blunder: ['??', 'b'], mistake: ['?', 'm'], inaccuracy: ['?!', 'i'], best: ['★', 'i'] };
        if (map[mark]) span.appendChild(el('sup', 'tag-' + map[mark][1], map[mark][0]));
      }
      if (review && review.rows[i]) {
        var row = review.rows[i];
        span.title = 'Accuracy ' + row.accuracy.toFixed(0) + '%' +
          (settings.showBestInsteadOfPlayed ? ' · better was ' + row.best : '') +
          ' · eval ' + fmtEval(row.evalAfter);
      }
      span.addEventListener('click', function (e) { goTo(parseInt(e.currentTarget.dataset.ply, 10)); });
      host.appendChild(span);
      host.appendChild(document.createTextNode(' '));
    }
    var cur = host.querySelector('.mv.cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  function fmtEval(cp) {
    if (cp == null) return '—';
    if (Math.abs(cp) > C.MATE - 1000) {
      var n = Math.ceil((C.MATE - Math.abs(cp)) / 2);
      return (cp > 0 ? '#' : '-#') + n;
    }
    var v = cp / 100;
    if (settings.evalFormat === 'centipawns') return (cp >= 0 ? '+' : '') + Math.round(cp);
    if (settings.evalFormat === 'mate') return (cp >= 0 ? '+' : '') + v.toFixed(2);
    return (v >= 0 ? '+' : '') + v.toFixed(2);
  }

  function renderStatus() {
    var st = game.status();
    var side = game.pos.turn === 'w' ? 'White' : 'Black';
    var txt;
    if (st === 'checkmate') txt = 'Checkmate — ' + (game.winner() === 'w' ? 'White' : 'Black') + ' wins';
    else if (st === 'stalemate') txt = 'Stalemate — draw';
    else if (st === 'fifty') txt = 'Draw — fifty-move rule';
    else if (st === 'repetition') txt = 'Draw — threefold repetition';
    else if (st === 'material') txt = 'Draw — insufficient material';
    else if (st === 'check') txt = side + ' to move — check';
    else txt = side + ' to move';
    if (viewPly < fullSans.length - 1) txt += ' · viewing ' + (viewPly + 1) + '/' + fullSans.length;
    $('status').textContent = txt;

    var op = fullSans.length ? C.lookupOpening(fullSans.slice(0, viewPly + 1)) : null;
    $('opening').textContent = op
      ? op.name + (op.eco ? '  ·  ECO ' + op.eco : '')
      : (fullSans.length ? 'Unknown opening' : 'Starting position');
  }

  function renderAll() {
    renderBoard();
    renderMoves();
    renderStatus();
    renderEvalLine();
    renderCoachMeta();
  }

  function renderEvalLine() {
    var host = $('evalLine');
    if (!lastAnalysis) { host.textContent = ''; return; }
    var a = lastAnalysis;
    var parts = [];
    if (settings.showAdvantageBadge) {
      var who = Math.abs(a.whiteScore) < 40 ? 'Equal' : a.whiteScore > 0 ? 'White is better' : 'Black is better';
      parts.push(who + ' (' + fmtEval(a.whiteScore) + ')');
    }
    if (settings.engineShowNodes) parts.push(a.nodes.toLocaleString() + ' nodes');
    if (settings.engineShowSpeed && a.timeMs > 0) parts.push(Math.round(a.nodes / (a.timeMs / 1000)).toLocaleString() + ' n/s');
    if (settings.engineShowTime) parts.push(a.timeMs + ' ms');
    parts.push('depth ' + a.depth);
    host.textContent = parts.join(' · ');
  }

  function renderTopMoves() {
    var host = $('topMoves');
    if (!lastAnalysis || !lastAnalysis.moves.length) {
      host.innerHTML = '<span class="muted">Press Analyze.</span>';
      return;
    }
    host.innerHTML = '';
    lastAnalysis.moves.slice(0, settings.engineMultipv).forEach(function (m, i) {
      var line = el('div', 'line' + (i === 0 ? ' best' : ''));
      line.appendChild(el('span', 'san', (i + 1) + '. ' + m.san));
      line.appendChild(el('span', 'sc', fmtEval(m.score)));
      if (settings.showPvLine) line.appendChild(el('span', 'pv', m.san));
      line.addEventListener('click', function () { playSan(m.san); });
      host.appendChild(line);
    });
  }

  // ------------------------------------------------------------- interaction
  function onSquareClick(e) {
    if (liveGame && settings.fairPlayGuard) { toast('Analysis is disabled while a live game is open.', true); return; }
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var legal = game.legalMoves();
    if (selected >= 0) {
      var cands = legal.filter(function (m) { return m.from === selected && m.to === idx; });
      if (cands.length > 1 && cands[0].promotion) {
        if (settings.autoPromoteQueen) { playMove(cands.filter(function (m) { return m.promotion === 'q'; })[0]); return; }
        openPromo(cands); return;
      }
      if (cands.length === 1) { playMove(cands[0]); return; }
    }
    var piece = game.pos.board[idx];
    selected = (piece && piece.c === game.pos.turn) ? idx : -1;
    renderBoard();
  }

  var pendingPromo = null;
  function openPromo(cands) {
    pendingPromo = cands;
    $('promoModal').classList.remove('hidden');
  }
  Array.prototype.forEach.call(document.querySelectorAll('#promoModal button'), function (b) {
    b.addEventListener('click', function () {
      $('promoModal').classList.add('hidden');
      if (b.dataset.p === 'cancel' || !pendingPromo) { pendingPromo = null; return; }
      var m = pendingPromo.filter(function (x) { return x.promotion === b.dataset.p; })[0];
      pendingPromo = null;
      if (m) playMove(m);
    });
  });

  function playMove(m) {
    if (viewPly < fullSans.length - 1) fullSans = fullSans.slice(0, viewPly + 1);
    var san;
    try { san = game.moveObj(m); } catch (e) { toast(e.message, true); return; }
    fullSans.push(san);
    viewPly = fullSans.length - 1;
    selected = -1;
    bestArrow = null;
    extraArrows = [];
    review = null;
    renderAll();
    renderTopMoves();
    persistSession();
    if (settings.sounds) sound(m.captured ? 'capture' : 'move');
    if (settings.autoAnalyzeOnMove) runAnalysis(true);
  }
  function playSan(san) {
    var m = C.sanToMove(game.pos, san);
    if (m) playMove(m);
  }

  // ------------------------------------------------------------- analysis
  function engineOptions(depthOverride) {
    return {
      depth: depthOverride || settings.engineDepth,
      timeMs: settings.engineTimeMs || 0,
      multipv: settings.engineMultipv,
      weights: S.engineWeights(settings),
      pieceValues: S.pieceValues(settings),
      randomness: settings.engineRandomness,
      blunderChance: settings.engineBlunderChance,
      contempt: settings.engineContemptDraw ? settings.engineContemptValue : 0
    };
  }

  function runAnalysis(silent) {
    if (liveGame && settings.fairPlayGuard) { toast('Analysis disabled during a live game.', true); return; }
    var seq = ++searchSeq;
    if (!silent) $('topMoves').innerHTML = '<span class="muted">Thinking…</span>';
    setTimeout(function () {
      if (seq !== searchSeq) return;
      var t0 = Date.now();
      var res = C.analyse(game.pos, engineOptions());
      if (seq !== searchSeq) return;
      res.timeMs = res.timeMs || (Date.now() - t0);
      lastAnalysis = res;
      updateEvalBar(res.whiteScore);
      bestArrow = res.moves[0] ? res.moves[0].move : null;
      extraArrows = settings.showTopArrows
        ? res.moves.slice(1, 3).map(function (m) { return m.move; })
        : [];
      renderTopMoves();
      renderEvalLine();
      renderBoard();
      if (!silent && res.mate) toast('Mate in ' + Math.abs(res.mate));
    }, 10);
  }

  function updateEvalBar(cp) {
    var pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    $('evalFill').style.height = pct + '%';
    $('evalText').textContent = fmtEval(cp);
  }

  // ------------------------------------------------------------- review
  function runReview(auto) {
    if (reviewRunning) return;
    if (!fullSans.length) { toast('Load a game first.', true); return; }
    if (liveGame && settings.fairPlayGuard) { toast('Review disabled during a live game.', true); return; }
    reviewRunning = true;
    $('btnReview').disabled = true;
    $('btnReview2').disabled = true;
    $('reviewInfo').innerHTML = '<span class="muted">Reviewing 0 / ' + fullSans.length + '…</span>';
    setTimeout(function () {
      var opts = {
        depth: settings.reviewDepth,
        moveTimeMs: settings.reviewTimePerMove || 0,
        blunderCp: settings.blunderCp,
        mistakeCp: settings.mistakeCp,
        inaccuracyCp: settings.inaccuracyCp
      };
      var result = C.reviewGame(baseFen, fullSans, opts, function (p) {
        $('reviewInfo').innerHTML = '<span class="muted">Reviewing ' + p.done + ' / ' + p.total + '…</span>';
        if (p.row) annotateInList(p.row);
      });
      review = result;
      reviewRunning = false;
      $('btnReview').disabled = false;
      $('btnReview2').disabled = false;
      renderReview();
      renderMoves();
      if (!auto) toast('Review complete');
    }, 20);
  }

  function renderReview() {
    if (!review) {
      $('reviewInfo').innerHTML = '<span class="muted">Load a game, then press Review.</span>';
      return;
    }
    var w = review.white, b = review.black;
    var rows = review.rows;
    var worst = rows.slice().sort(function (a, c) { return c.loss - a.loss; })[0];
    $('reviewInfo').innerHTML =
      '<div class="accRow"><b>White</b><div class="bar"><span style="width:' + w.accuracy + '%"></span></div>' +
      '<b>' + w.accuracy + '%</b></div>' +
      '<div class="accRow"><b>Black</b><div class="bar"><span style="width:' + b.accuracy + '%"></span></div>' +
      '<b>' + b.accuracy + '%</b></div>' +
      '<div class="small" style="margin-top:8px">' +
      w.count + ' moves each · ' + (w.blunders + b.blunders) + ' blunders · ' +
      (w.mistakes + b.mistakes) + ' mistakes · ' + (w.inaccuracies + b.inaccuracies) + ' inaccuracies' +
      (worst ? '<br>Biggest swing: ' + (Math.floor(worst.ply / 2) + 1) + (worst.side === 'w' ? '.' : '…') +
        worst.san + ' (−' + (worst.loss / 100).toFixed(2) + ')' : '') +
      '<br>depth ' + review.depth + ' · accuracy model: ' + settings.accuracyModel + '</div>';

    renderAccuracyBars(w, b);
    renderAccuracyGraph(rows);
    renderReviewList(rows);
  }

  function renderAccuracyBars(w, b) {
    if (!settings.showAccuracyPerSide) { $('accuracyBars').innerHTML = ''; return; }
    var host = $('accuracyBars');
    host.innerHTML = '';
    [['White', w], ['Black', b]].forEach(function (pair) {
      var row = el('div', 'accRow');
      row.appendChild(el('b', null, pair[0]));
      var bar = el('div', 'bar');
      var fill = el('span');
      fill.style.width = (pair[1] ? pair[1].accuracy : 0) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('b', null, (pair[1] ? pair[1].accuracy : 0) + '%'));
      host.appendChild(row);
    });
  }

  function renderAccuracyGraph(rows) {
    var svg = $('accuracyGraph');
    var wrap = $('accuracyGraphWrap');
    if (!settings.showAccuracyGraph || !rows.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var W = 300, H = 90, n = rows.length;
    var pts = rows.map(function (r, i) {
      var x = n === 1 ? W / 2 : (i / (n - 1)) * W;
      var y = H - (r.accuracy / 100) * H;
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    svg.innerHTML =
      '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#1f9d4d" stop-opacity=".45"/>' +
      '<stop offset="100%" stop-color="#1f9d4d" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon points="0,' + H + ' ' + pts.join(' ') + ' ' + W + ',' + H + '" fill="url(#ag)"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#1f9d4d" stroke-width="1.6"/>';
  }

  function renderReviewList(rows) {
    var host = $('reviewList');
    host.innerHTML = '';
    var interesting = rows.filter(function (r) {
      return r.classification === 'blunder' || r.classification === 'mistake' || r.classification === 'inaccuracy';
    });
    if (!interesting.length) {
      host.innerHTML = '<span class="muted">No blunders found. Nice game.</span>';
      return;
    }
    interesting.sort(function (a, b) { return b.loss - a.loss; });
    interesting.forEach(function (r) {
      var item = el('div', 'item');
      var badge = el('span', 'badge ' + r.classification, r.classification === 'blunder' ? '??' : r.classification === 'mistake' ? '?' : '?!');
      item.appendChild(badge);
      item.appendChild(document.createTextNode((Math.floor(r.ply / 2) + 1) + (r.side === 'w' ? '. ' : '… ') + r.san));
      if (settings.showBestInsteadOfPlayed) item.appendChild(el('span', 'small', '  →  ' + r.best + ' was better'));
      item.addEventListener('click', function () { goTo(r.ply); });
      host.appendChild(item);
    });
  }

  function annotateInList(row) {
    // cheap incremental feedback while the review streams
    var svg = $('accuracyGraph');
    if (!svg) return;
  }

  function nextBlunder() {
    if (!review) { runReview(); return; }
    var order = review.rows.slice().sort(function (a, b) { return a.ply - b.ply; });
    for (var i = 0; i < order.length; i++) {
      var r = order[i];
      if (r.ply > viewPly && (r.classification === 'blunder' || r.classification === 'mistake')) { goTo(r.ply); return; }
    }
    for (var j = 0; j < order.length; j++) {
      var q = order[j];
      if (q.classification === 'blunder' || q.classification === 'mistake') { goTo(q.ply); return; }
    }
    toast('No blunders to jump to');
  }

  // ------------------------------------------------------------- coach
  function providerList() {
    return S.byId.provider.options;
  }

  function keyPresent() { return !!settings.apiKey; }

  function renderCoachMeta() {
    var meta = $('coachMeta');
    if (!meta) return;
    var bits = [];
    bits.push((providerList()[settings.provider] || settings.provider) + ' · ' + (settings.model || 'no model'));
    bits.push('T ' + settings.temperature);
    bits.push(keyPresent() ? 'key set' : 'no key');
    if (usingChromeStorage) bits.push('chrome.storage');
    meta.textContent = bits.join(' · ');
    renderCoachKeyState();
  }

  function renderCoachKeyState() {
    var ks = $('keyState');
    if (!ks) return;
    ks.textContent = keyPresent()
      ? 'Key saved locally' + (settings.sessionOnlyKey ? ' (session only)' : '') + '. Used only for your chosen provider.'
      : 'No API key yet. Engine analysis works without one.';
    $('quickProvider').value = settings.provider;
    $('quickModel').value = settings.model || '';
    $('quickKey').value = settings.apiKey ? '••••••••••••' : '';
  }

  function syncQuickFields() {
    var sel = $('quickProvider');
    if (!sel.options.length) {
      Object.keys(providerList()).forEach(function (k) {
        var o = el('option', null, providerList()[k]); o.value = k; sel.appendChild(o);
      });
    }
    renderCoachKeyState();
  }

  function addMsg(text, who) {
    var d = el('div', 'msg ' + who);
    d.textContent = text;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    return d;
  }

  function positionContext() {
    var lines = [];
    if (settings.includeFen) lines.push('FEN: ' + game.fen());
    if (settings.contextMoves > 0) {
      var shown = fullSans.slice(Math.max(0, viewPly + 1 - settings.contextMoves), viewPly + 1);
      lines.push('Moves played: ' + (shown.join(' ') || '(none)'));
    }
    lines.push('Side to move: ' + (game.pos.turn === 'w' ? 'White' : 'Black'));
    var op = fullSans.length ? C.lookupOpening(fullSans.slice(0, viewPly + 1)) : null;
    if (op) lines.push('Opening: ' + op.name);
    if (settings.includeEngineEval) {
      var a = lastAnalysis || C.analyse(game.pos, { depth: Math.min(3, settings.engineDepth) });
      lines.push('Engine evaluation (white POV, depth ' + a.depth + '): ' + fmtEval(a.whiteScore));
      if (settings.includeEngineLines) {
        lines.push('Engine top moves: ' + a.moves.slice(0, 3).map(function (m) {
          return m.san + ' (' + fmtEval(m.score) + ')';
        }).join(', '));
      }
    }
    if (settings.includeReviewMarks && review) {
      var bad = review.rows.filter(function (r) { return r.classification === 'blunder' || r.classification === 'mistake'; });
      if (bad.length) {
        lines.push('Review found: ' + bad.slice(0, 8).map(function (r) {
          return r.san + ' (' + r.classification + ', better ' + r.best + ')';
        }).join('; '));
      }
    }
    return lines.join('\n');
  }

  function endpoint() {
    switch (settings.provider) {
      case 'anthropic': return 'https://api.anthropic.com/v1/messages';
      case 'ollama': return (settings.baseUrl || 'http://localhost:11434') + '/v1/chat/completions';
      case 'lmstudio': return (settings.baseUrl || 'http://localhost:1234') + '/v1/chat/completions';
      case 'custom': return (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      default: return 'https://api.openai.com/v1/chat/completions';
    }
  }

  function verbosityNote() {
    var map = {
      terse: 'Answer in at most three sentences.',
      normal: 'Answer in a short paragraph.',
      detailed: 'Answer with structure: the key idea, the concrete line, then what to train.',
      essay: 'Give a thorough lesson with headings, concrete variations, and training advice.'
    };
    return map[settings.verbosity] || map.normal;
  }

  async function askCoach(question) {
    if (liveGame && settings.fairPlayGuard) { toast('Coach disabled during a live game.', true); return; }
    if (!keyPresent() && settings.provider !== 'ollama' && settings.provider !== 'lmstudio') {
      addMsg('Add an API key in Coach setup or Settings → Coach. The engine works without one.', 'ai error');
      return;
    }
    var bubble = addMsg('Thinking…', 'ai');
    var system = (S.personas[settings.persona] || settings.systemPrompt) +
      '\nRespond in ' + (S.byId.language.options[settings.language] || 'English') + '. ' + verbosityNote() +
      '\nNever help with live-game analysis; assume this is a finished game or a study position.';
    var ctx = positionContext();
    var messages = [];
    if (settings.rememberChat && chatHistory.length) {
      messages = chatHistory.slice(-settings.chatMemoryTurns * 2);
    }
    messages.push({ role: 'user', content: ctx + '\n\nQuestion: ' + question });

    try {
      var reply = await callModel(system, messages);
      bubble.textContent = reply;
      if (settings.rememberChat) {
        chatHistory.push({ role: 'user', content: question });
        chatHistory.push({ role: 'assistant', content: reply });
        if (chatHistory.length > settings.chatMemoryTurns * 2 + 4) chatHistory = chatHistory.slice(-settings.chatMemoryTurns * 2);
      }
    } catch (e) {
      bubble.className = 'msg ai error';
      bubble.textContent = 'Request failed: ' + e.message + ' — check key, model, and connection.';
      if (settings.fallbackModel) {
        var prev = settings.model;
        settings.model = settings.fallbackModel;
        try {
          var alt = await callModel(system, messages);
          bubble.className = 'msg ai';
          bubble.textContent = alt + '\n\n(fallback model: ' + settings.fallbackModel + ')';
          settings.model = prev;
        } catch (e2) {
          settings.model = prev;
          bubble.textContent += '\nFallback also failed: ' + e2.message;
        }
      }
    }
  }

  async function callModel(system, messages) {
    var isAnthropic = settings.provider === 'anthropic';
    if (isAnthropic) {
      var body = {
        model: settings.model || 'claude-sonnet-4-5',
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        top_p: settings.topP,
        system: system,
        messages: messages
      };
      var res = await fetch(endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      });
      var j = await res.json();
      if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
      return (j.content || []).map(function (c) { return c.text || ''; }).join('').trim();
    }
    var payload = {
      model: settings.model || 'gpt-4o-mini',
      temperature: settings.temperature,
      top_p: settings.topP,
      max_tokens: settings.maxTokens,
      presence_penalty: settings.presencePenalty,
      frequency_penalty: settings.frequencyPenalty,
      messages: [{ role: 'system', content: system }].concat(messages)
    };
    if (settings.seed) payload.seed = settings.seed;
    if (settings.streamResponses) payload.stream = false; // streaming needs SSE parsing; kept off here
    var r2 = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (settings.apiKey || 'local') },
      body: JSON.stringify(payload)
    });
    var j2 = await r2.json().catch(function () { return {}; });
    if (!r2.ok) {
      throw new Error((j2.error && j2.error.message) || ('HTTP ' + r2.status));
    }
    var msg = j2.choices && j2.choices[0] && j2.choices[0].message;
    if (!msg) throw new Error('Unexpected response shape');
    return (msg.content || '').trim();
  }

  // ------------------------------------------------------------- import
  function ccCacheGet(key) {
    if (!settings.importCache) return null;
    var cache = store.get(KEY_CACHE, {});
    var hit = cache[key];
    if (!hit) return null;
    if (Date.now() - hit.ts > settings.importCacheMinutes * 60000) return null;
    return hit.value;
  }
  function ccCacheSet(key, value) {
    if (!settings.importCache) return;
    var cache = store.get(KEY_CACHE, {});
    cache[key] = { ts: Date.now(), value: value };
    // keep it small
    var keys = Object.keys(cache);
    if (keys.length > 24) keys.slice(0, keys.length - 24).forEach(function (k) { delete cache[k]; });
    store.set(KEY_CACHE, cache);
  }

  async function fetchJson(url) {
    var cached = ccCacheGet(url);
    if (cached) return cached;
    var res = await fetch(url);
    if (res.status === 404) throw new Error('No such Chess.com player');
    if (res.status === 429) throw new Error('Rate limited by Chess.com — wait a moment and retry');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    ccCacheSet(url, json);
    return json;
  }

  function resultClass(result) {
    if (result === 'win') return 'win';
    if (result === 'draw' || result === 'agreed' || result === 'repetition' || result === 'stalemate' ||
      result === 'insufficient' || result === '50move' || result === 'timevsinsufficient') return 'draw';
    return 'loss';
  }

  async function loadChesscomGames() {
    var user = ($('ccUser').value || settings.chesscomUser || '').trim().toLowerCase();
    if (!user) { toast('Enter a Chess.com username', true); return; }
    settings.chesscomUser = user;
    saveSettings(true);
    var info = $('ccInfo');
    info.textContent = 'Fetching archives…';
    $('gameList').innerHTML = '';
    try {
      var arch = await fetchJson('https://api.chess.com/pub/player/' + encodeURIComponent(user) + '/games/archives');
      if (!arch.archives || !arch.archives.length) throw new Error('No public game archives for that account');
      var latest = arch.archives.slice().reverse().find(function (u) {
        return true;
      });
      var games = [];
      var months = arch.archives.slice(-3).reverse();
      for (var i = 0; i < months.length && games.length < settings.importMaxGames; i++) {
        info.textContent = 'Fetching games… (' + (i + 1) + '/' + months.length + ')';
        var m = await fetchJson(months[i]);
        var list = (m.games || []).slice().reverse();
        for (var j = 0; j < list.length; j++) {
          var g = list[j];
          if (settings.importTimeClass !== 'all' && g.time_class !== settings.importTimeClass) continue;
          if (settings.importRatedOnly && !g.rated) continue;
          var mine = (g.white && g.white.username || '').toLowerCase() === user ? g.white : g.black;
          if (settings.importWinsOnly && mine.result !== 'win') continue;
          games.push(g);
          if (games.length >= settings.importMaxGames) break;
        }
      }
      if (!games.length) throw new Error('No games matched those filters');
      info.textContent = games.length + ' finished game' + (games.length === 1 ? '' : 's') + ' loaded. Pick one:';
      renderGameList(games, user);
    } catch (e) {
      info.textContent = 'Import failed: ' + e.message;
    }
  }

  function renderGameList(games, user) {
    var host = $('gameList');
    host.innerHTML = '';
    games.forEach(function (g) {
      var white = (g.white && g.white.username) || '?';
      var black = (g.black && g.black.username) || '?';
      var mine = white.toLowerCase() === user ? g.white : g.black;
      var result = mine ? mine.result : null;
      var item = el('div', 'gameItem ' + resultClass(result));
      var who = el('div', 'who', white + ' (' + (g.white && g.white.rating) + ') vs ' + black + ' (' + (g.black && g.black.rating) + ')');
      var meta = el('div', 'res', (g.time_class || '?') + ' · ' + (g.time_control || '?') + ' · ' +
        (result || '?') + (g.rated ? ' · rated' : '') +
        (g.accuracies ? ' · acc ' + Math.round(g.accuracies.white) + '/' + Math.round(g.accuracies.black) : ''));
      item.appendChild(who);
      item.appendChild(meta);
      item.addEventListener('click', function () { loadGameFromApi(g, user); });
      host.appendChild(item);
    });
  }

  function loadGameFromApi(g, user) {
    try {
      var parsed = C.parsePGN(g.pgn);
      var headers = parsed.headers;
      headers.Result = headers.Result || '*';
      setGame(headers.FEN || C.START_FEN, parsed.sans, headers);
      $('pgnInput').value = g.pgn;
      if (settings.showAccuracies && g.accuracies) {
        toast('Chess.com accuracy: ' + Math.round(g.accuracies.white) + ' / ' + Math.round(g.accuracies.black));
      }
      // show the board from the imported player's side
      flipped = (g.black && g.black.username || '').toLowerCase() === (user || '');
      renderAll();
    } catch (e) {
      toast('Could not parse that game: ' + e.message, true);
    }
  }

  // ------------------------------------------------------------- saved games
  function savedGames() { return store.get(KEY_GAMES, []); }
  function saveCurrentGame() {
    if (!fullSans.length && baseFen === C.START_FEN) { toast('Nothing to save yet', true); return; }
    var list = savedGames();
    var label = (startHeaders.White && startHeaders.Black)
      ? startHeaders.White + ' vs ' + startHeaders.Black
      : (fullSans.length ? 'Game · ' + fullSans.length + ' moves' : 'Study position');
    list.unshift({
      id: 'g' + Date.now(),
      fen: baseFen, sans: fullSans, headers: startHeaders,
      label: label, ts: Date.now()
    });
    store.set(KEY_GAMES, list.slice(0, 50));
    renderSaved();
    toast('Saved');
  }
  function renderSaved() {
    var host = $('savedList');
    var list = savedGames();
    host.innerHTML = '';
    if (!list.length) { host.innerHTML = '<span class="muted">Nothing saved yet.</span>'; return; }
    list.forEach(function (g, i) {
      var item = el('div', 'gameItem');
      item.appendChild(el('div', 'who', g.label));
      item.appendChild(el('div', 'res', g.sans.length + ' moves · ' + new Date(g.ts).toLocaleDateString()));
      item.addEventListener('click', function () { setGame(g.fen, g.sans, g.headers); });
      var del = el('button', 'tiny danger', '✕');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var l = savedGames(); l.splice(i, 1); store.set(KEY_GAMES, l); renderSaved();
      });
      item.appendChild(del);
      host.appendChild(item);
    });
  }

  // ------------------------------------------------------------- settings UI
  var settingsTier = 'core';
  var settingsQuery = '';

  function tierRank(t) { return t === 'lab' ? 2 : t === 'advanced' ? 1 : 0; }

  function renderSettings() {
    var host = $('settingsBody');
    if (!host) return;
    var openSections = {};
    Array.prototype.forEach.call(host.querySelectorAll('details'), function (d) {
      openSections[d.dataset.section] = d.open;
    });
    var limit = tierRank(settingsTier);
    var q = settingsQuery.trim().toLowerCase();
    host.innerHTML = '';
    var shown = 0;

    S.sections.forEach(function (section) {
      var fields = section.fields.filter(function (f) {
        if (f.type === 'button') return limit >= 0 && (!q || f.label.toLowerCase().indexOf(q) >= 0);
        if (tierRank(f.tier) > limit) return false;
        if (q) {
          var hay = (f.label + ' ' + f.id + ' ' + (f.help || '') + ' ' + f.group).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
      if (!fields.length) return;
      shown += fields.length;

      var det = el('details', 'setSection');
      det.dataset.section = section.id;
      det.open = openSections[section.id] !== undefined ? openSections[section.id] : (!!q || section.id === 'board');
      var summary = el('summary');
      summary.appendChild(el('span', null, (section.icon || '') + ' ' + section.title));
      summary.appendChild(el('span', 'pill', String(fields.length)));
      det.appendChild(summary);
      var body = el('div', 'body');

      var groups = {};
      fields.forEach(function (f) { (groups[f.group] = groups[f.group] || []).push(f); });
      Object.keys(groups).forEach(function (gname) {
        var g = el('div', 'setGroup');
        g.appendChild(el('h4', null, gname));
        groups[gname].forEach(function (f) { g.appendChild(renderField(f)); });
        body.appendChild(g);
      });
      det.appendChild(body);
      host.appendChild(det);
    });

    $('settingsCount').textContent = shown + ' shown · ' + S.count + ' total';
    if (!shown) host.innerHTML = '<div class="empty">No settings match “' + settingsQuery + '”.</div>';
  }

  function renderField(f) {
    var row = el('div', 'setRow tier-' + f.tier + (f.type === 'textarea' ? ' full' : '') + (f.locked ? ' locked' : ''));
    var lblWrap = el('div');
    var lbl = el('label', 'lbl', f.label);
    lbl.htmlFor = 'set_' + f.id;
    lblWrap.appendChild(lbl);
    if (f.help) lblWrap.appendChild(el('span', 'help', f.help));
    row.appendChild(lblWrap);

    var input;
    if (f.type === 'toggle') {
      input = el('input'); input.type = 'checkbox'; input.checked = !!settings[f.id];
      input.addEventListener('change', function () { set(f.id, input.checked); });
    } else if (f.type === 'select') {
      input = el('select');
      Object.keys(f.options).forEach(function (k) {
        var o = el('option', null, f.options[k]); o.value = k; input.appendChild(o);
      });
      input.value = settings[f.id];
      input.addEventListener('change', function () { set(f.id, input.value); });
    } else if (f.type === 'range' || f.type === 'number') {
      input = el('input');
      input.type = f.type;
      if (f.min != null) input.min = f.min;
      if (f.max != null) input.max = f.max;
      if (f.step != null) input.step = f.step;
      input.value = settings[f.id];
      var val = el('span', 'val', String(settings[f.id]) + (f.unit ? ' ' + f.unit : ''));
      input.addEventListener('input', function () {
        val.textContent = input.value + (f.unit ? ' ' + f.unit : '');
        set(f.id, parseFloat(input.value));
      });
      var wrap = el('div');
      wrap.appendChild(input);
      wrap.appendChild(val);
      input = wrap;
    } else if (f.type === 'textarea') {
      input = el('textarea');
      input.rows = f.rows || 3;
      input.value = settings[f.id] || '';
      input.addEventListener('change', function () { set(f.id, input.value); });
    } else if (f.type === 'password') {
      input = el('input'); input.type = 'password';
      input.value = settings[f.id] || '';
      input.placeholder = 'sk-…';
      input.addEventListener('change', function () { set(f.id, input.value); });
    } else if (f.type === 'button') {
      input = el('button', f.danger ? 'tiny danger' : 'tiny', f.label);
      input.addEventListener('click', function () { runSettingsAction(f.action); });
      row.innerHTML = '';
      row.classList.add('full');
      row.appendChild(input);
      return row;
    } else {
      input = el('input'); input.type = 'text';
      input.value = settings[f.id] || '';
      if (f.placeholder) input.placeholder = f.placeholder;
      input.addEventListener('change', function () { set(f.id, input.value); });
    }
    if (input.id !== undefined) input.id = 'set_' + f.id;
    row.appendChild(input);
    return row;
  }

  function runSettingsAction(action) {
    if (action === 'exportSettings') {
      var blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chess-coach-settings.json';
      a.click();
      toast('Settings exported');
    } else if (action === 'importSettings') {
      $('importFile').click();
    } else if (action === 'resetSettings') {
      if (!confirm('Reset every setting to its default?')) return;
      settings = S.normalise({});
      persist(settings);
      applySettings(settings);
      toast('Settings reset');
    } else if (action === 'clearCache') {
      store.del(KEY_CACHE);
      toast('Cache cleared');
    }
  }

  function applyPreset(name) {
    var preset = S.presets[name];
    if (!preset) return;
    Object.keys(preset).forEach(function (k) { settings[k] = preset[k]; });
    persist(settings);
    applySettings(settings);
    toast('Preset applied: ' + name);
  }

  // ------------------------------------------------------------- misc UI
  function toast(msg, isError) {
    if (!settings.toastNotifications) return;
    var host = $('toasts');
    var node = el('div', 'toast' + (isError ? ' err' : ''), msg);
    host.appendChild(node);
    setTimeout(function () { node.remove(); }, settings.toastMs || 2500);
  }

  var audioCtx = null;
  function sound(kind) {
    if (!settings.sounds) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.frequency.value = kind === 'capture' ? 220 : 440;
      gain.gain.value = (settings.soundVolume / 100) * 0.08;
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.stop(audioCtx.currentTime + 0.13);
    } catch (e) {}
  }

  function switchTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
      p.classList.toggle('active', p.dataset.panel === name);
    });
    if (name === 'settings') renderSettings();
    if (name === 'library') renderSaved();
  }

  function updateDepthOptions() {
    var sel = $('depthSel');
    if (!sel) return;
    sel.innerHTML = '';
    for (var d = 1; d <= 8; d++) {
      var o = el('option', null, 'd' + d);
      o.value = d;
      if (d === settings.engineDepth) o.selected = true;
      sel.appendChild(o);
    }
  }

  // ------------------------------------------------------------- wiring
  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { switchTab(t.dataset.tab); });
    });
    on('btnQuickSettings', 'click', function () { switchTab('settings'); });

    on('btnNew', 'click', function () {
      if (settings.confirmDestructive && fullSans.length && !confirm('Start a new game? Unsaved moves will be lost.')) return;
      setGame(C.START_FEN, [], {});
      $('topMoves').innerHTML = '<span class="muted">Press Analyze.</span>';
      lastAnalysis = null;
      updateEvalBar(0);
    });
    on('btnFlip', 'click', function () { flipped = !flipped; renderBoard(); renderSettings(); });
    on('btnUndo', 'click', function () {
      if (viewPly < 0) return;
      fullSans = fullSans.slice(0, viewPly);
      viewPly = fullSans.length - 1;
      review = null;
      bestArrow = null;
      rebuild();
      persistSession();
    });
    on('btnStart', 'click', function () { goTo(-1); });
    on('btnPrev', 'click', function () { goTo(viewPly - 1); });
    on('btnNext', 'click', function () { goTo(viewPly + 1); });
    on('btnEnd', 'click', function () { goTo(fullSans.length - 1); });
    on('btnAnalyze', 'click', function () { runAnalysis(false); });
    on('depthSel', 'change', function () {
      settings.engineDepth = parseInt($('depthSel').value, 10);
      saveSettings(true);
      runAnalysis(false);
    });
    on('btnReview', 'click', function () { runReview(); switchTab('review'); });
    on('btnReview2', 'click', function () { runReview(); });
    on('btnNextBlunder', 'click', nextBlunder);

    on('btnFen', 'click', function () {
      try {
        var fen = $('fenInput').value.trim();
        if (!fen) return;
        new C.Game(fen);
        setGame(fen, [], {});
        toast('Position loaded');
      } catch (e) { toast(e.message, true); }
    });
    on('btnCopyFen', 'click', function () { copy(game.fen(), 'FEN copied'); });
    on('btnPgn', 'click', function () {
      var text = $('pgnInput').value.trim();
      if (!text) return;
      try {
        var parsed = C.parsePGN(text);
        if (!parsed.sans.length) throw new Error('no moves found');
        setGame(parsed.headers.FEN || C.START_FEN, parsed.sans, parsed.headers);
        toast(parsed.sans.length + ' moves loaded' + (parsed.errors.length ? ' (stopped at "' + parsed.errors[0].token + '")' : ''));
      } catch (e) { toast('Could not read that PGN: ' + e.message, true); }
    });
    on('btnExportPgn', 'click', function () {
      $('pgnInput').value = C.toPGN(game, startHeaders);
      toast('PGN written to the box below');
    });
    on('btnCopyPgn', 'click', function () {
      copy($('pgnInput').value || C.toPGN(game, startHeaders), 'PGN copied');
    });

    on('btnSend', 'click', function () {
      var q = $('chatInput').value.trim();
      if (!q) return;
      if (!fullSans.length && !game.history.length && settings.askForPgnOnEmpty) {
        // still answer, but nudge
        toast('Tip: load a game or paste a PGN for a position-specific answer');
      }
      addMsg(q, 'user');
      $('chatInput').value = '';
      askCoach(q);
    });
    on('chatInput', 'keydown', function (e) { if (e.key === 'Enter') $('btnSend').click(); });
    Array.prototype.forEach.call(document.querySelectorAll('#chatChips .chip'), function (c) {
      c.addEventListener('click', function () {
        addMsg(c.dataset.q, 'user');
        askCoach(c.dataset.q);
      });
    });
    on('btnClearChat', 'click', function () {
      chatHistory = [];
      $('chatLog').innerHTML = '';
    });
    on('btnSaveKey', 'click', function () {
      settings.apiKey = $('quickKey').value.trim();
      saveSettings(true);
      renderCoachKeyState();
      toast('Key saved locally');
    });
    on('quickProvider', 'change', function () { set('provider', $('quickProvider').value); });
    on('quickModel', 'change', function () { set('model', $('quickModel').value); });
    on('btnOpenCoachSettings', 'click', function () {
      settingsQuery = 'coach';
      $('settingsSearch').value = 'coach';
      switchTab('settings');
      renderSettings();
    });

    on('btnCcLoad', 'click', loadChesscomGames);
    on('btnSaveCurrent', 'click', saveCurrentGame);
    on('btnClearSaved', 'click', function () {
      if (!confirm('Delete all saved games?')) return;
      store.del(KEY_GAMES);
      renderSaved();
    });

    var ccSel = $('ccTimeClass');
    if (ccSel) {
      Object.keys(S.byId.importTimeClass.options).forEach(function (k) {
        var o = el('option', null, S.byId.importTimeClass.options[k]); o.value = k; ccSel.appendChild(o);
      });
      ccSel.value = settings.importTimeClass;
      on(ccSel, 'change', function () { set('importTimeClass', ccSel.value); });
    }
    var rated = $('ccRated');
    if (rated) {
      rated.checked = settings.importRatedOnly;
      on(rated, 'change', function () { set('importRatedOnly', rated.checked); });
    }

    on('settingsSearch', 'input', function () {
      settingsQuery = $('settingsSearch').value;
      renderSettings();
    });
    on('tierSel', 'change', function () { settingsTier = $('tierSel').value; renderSettings(); });
    var presetSel = $('presetSel');
    if (presetSel) {
      presetSel.appendChild(el('option', null, 'Apply preset…')).value = '';
      Object.keys(S.presets).forEach(function (k) {
        var o = el('option', null, k); o.value = k; presetSel.appendChild(o);
      });
      on(presetSel, 'change', function () {
        if (presetSel.value) applyPreset(presetSel.value);
        presetSel.value = '';
      });
    }

    on('importFile', 'change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          settings = S.normalise(parsed);
          persist(settings);
          applySettings(settings);
          toast('Settings imported');
        } catch (err) { toast('Invalid settings file', true); }
      };
      reader.readAsText(file);
    });

    document.addEventListener('keydown', function (e) {
      if (!settings.keyboardShortcuts) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key) {
        case 'ArrowLeft': goTo(viewPly - 1); e.preventDefault(); break;
        case 'ArrowRight': goTo(viewPly + 1); e.preventDefault(); break;
        case 'ArrowUp': goTo(-1); e.preventDefault(); break;
        case 'ArrowDown': goTo(fullSans.length - 1); e.preventDefault(); break;
        case 'Home': goTo(-1); e.preventDefault(); break;
        case 'End': goTo(fullSans.length - 1); e.preventDefault(); break;
        case 'a': case 'A': runAnalysis(false); break;
        case 'r': case 'R': runReview(); break;
        case 'f': case 'F': flipped = !flipped; renderBoard(); break;
        case 'u': case 'U': $('btnUndo').click(); break;
        case 'n': case 'N': $('btnNew').click(); break;
        case 'b': case 'B': if (settings.jumpToNextBlunder) nextBlunder(); break;
        case '?': switchTab('settings'); break;
        case 'Escape': $('promoModal').classList.add('hidden'); break;
      }
    });

    // fair-play state from the extension background worker
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'get-live-state' }, function (state) {
        applyLiveState(state && state.liveGameDetected);
      });
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area === 'session' && changes.liveGameDetected) {
            applyLiveState(changes.liveGameDetected.newValue);
          }
        });
      }
    }
  }

  function applyLiveState(live) {
    liveGame = !!live;
    var notice = $('liveNotice');
    if (notice) notice.hidden = !(live && settings.warnOnLiveTab);
    var pill = $('modePill');
    pill.textContent = live ? 'Live game open — locked' : 'Study mode';
    pill.classList.toggle('on', !live);
    ['btnAnalyze', 'btnReview', 'btnReview2', 'btnSend', 'btnNextBlunder'].forEach(function (id) {
      var b = $(id);
      if (b) {
        b.disabled = live && settings.fairPlayGuard;
        b.title = live && settings.fairPlayGuard ? 'Disabled while a live game is open (fair play)' : '';
      }
    });
  }

  function copy(text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(message || 'Copied'); },
        function () { toast('Copy failed', true); });
    } else {
      toast('Clipboard unavailable', true);
    }
  }

  // ------------------------------------------------------------- boot
  function boot() {
    wire();
    loadSettings();
    if (!restoreSession()) {
      setGame(C.START_FEN, [], {});
    }
    renderAll();
    renderSaved();
    renderCoachMeta();
    updateDepthOptions();
    renderSettings();
    if ($('ccUser')) $('ccUser').value = settings.chesscomUser || '';
    if (settings.importAutoLoadLatest && settings.chesscomUser) {
      setTimeout(loadChesscomGames, 400);
    }
    if (settings.persona && S.personas[settings.persona] && !settings._customPrompt) {
      // keep stored prompt unless the persona was switched in this session
    }
  }

  // exposed for the extension and for tests
  window.ChessCoach = {
    setGame: setGame, goTo: goTo, addMsg: addMsg, askCoach: askCoach,
    getGame: function () { return game; },
    getSettings: function () { return settings; },
    setSetting: set, applySettings: applySettings, runAnalysis: runAnalysis,
    runReview: runReview, applyLiveState: applyLiveState, switchTab: switchTab,
    renderSaved: renderSaved, loadChesscomGames: loadChesscomGames,
    core: C, settingsSchema: S
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
