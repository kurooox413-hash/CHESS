/* Chess Coach — chess core v2
 * Rules, FEN/SAN/PGN, search engine, evaluation, game review, opening book.
 * Zero dependencies. Browser (window.ChessCore) + Node (module.exports).
 *
 * Board: array of 64. Index 0 = a8, 63 = h1.
 * Piece: { t: 'p'|'n'|'b'|'r'|'q'|'k', c: 'w'|'b' }
 */
(function (root) {
  'use strict';

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var FILES = 'abcdefgh';
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  var MATE = 100000;

  function sqName(i) { return FILES[i % 8] + (8 - Math.floor(i / 8)); }
  function sqIndex(name) { return (8 - parseInt(name[1], 10)) * 8 + FILES.indexOf(name[0]); }
  function opp(c) { return c === 'w' ? 'b' : 'w'; }

  // ---------------------------------------------------------------- FEN
  function parseFEN(fen) {
    if (typeof fen !== 'string') throw new Error('FEN must be a string');
    var parts = fen.trim().split(/\s+/);
    var rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Invalid FEN: expected 8 ranks');
    var board = new Array(64).fill(null);
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        if ('pnbrqkPNBRQK'.indexOf(ch) < 0) throw new Error('Invalid FEN: bad piece "' + ch + '"');
        if (f > 7) throw new Error('Invalid FEN: rank ' + (8 - r) + ' overflows');
        board[r * 8 + f] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b' };
        f++;
      }
      if (f !== 8) throw new Error('Invalid FEN: rank ' + (8 - r) + ' has ' + f + ' squares');
    }
    var castling = parts[2] && parts[2] !== '-' ? parts[2].replace(/[^KQkq]/g, '') : '';
    return {
      board: board,
      turn: parts[1] === 'b' ? 'b' : 'w',
      castling: castling,
      ep: parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1,
      halfmove: parseInt(parts[4] || '0', 10) || 0,
      fullmove: parseInt(parts[5] || '1', 10) || 1
    };
  }

  function toFEN(pos) {
    var out = '';
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = pos.board[r * 8 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += p.c === 'w' ? p.t.toUpperCase() : p.t;
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    return out + ' ' + pos.turn + ' ' + (pos.castling || '-') + ' ' +
      (pos.ep >= 0 ? sqName(pos.ep) : '-') + ' ' + pos.halfmove + ' ' + pos.fullmove;
  }

  function clonePos(pos) {
    return {
      board: pos.board.map(function (p) { return p ? { t: p.t, c: p.c } : null; }),
      turn: pos.turn, castling: pos.castling, ep: pos.ep,
      halfmove: pos.halfmove, fullmove: pos.fullmove
    };
  }

  // Position identity for repetition + transposition tables.
  function positionKey(pos) {
    return toFEN(pos).split(' ').slice(0, 4).join(' ');
  }

  // ---------------------------------------------------------------- attacks
  var KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var ALL8 = DIAG.concat(ORTH);

  function findKing(board, c) {
    for (var i = 0; i < 64; i++) if (board[i] && board[i].t === 'k' && board[i].c === c) return i;
    return -1;
  }

  function isAttacked(board, sq, by) {
    var r = Math.floor(sq / 8), f = sq % 8;
    var pr = by === 'w' ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      for (var k = 0; k < 2; k++) {
        var pf = f + (k === 0 ? -1 : 1);
        if (pf < 0 || pf > 7) continue;
        var p = board[pr * 8 + pf];
        if (p && p.t === 'p' && p.c === by) return true;
      }
    }
    for (var n = 0; n < 8; n++) {
      var nr = r + KNIGHT_D[n][0], nf = f + KNIGHT_D[n][1];
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
      var np = board[nr * 8 + nf];
      if (np && np.t === 'n' && np.c === by) return true;
    }
    for (var g = 0; g < 8; g++) {
      var gr = r + KING_D[g][0], gf = f + KING_D[g][1];
      if (gr < 0 || gr > 7 || gf < 0 || gf > 7) continue;
      var gp = board[gr * 8 + gf];
      if (gp && gp.t === 'k' && gp.c === by) return true;
    }
    for (var d = 0; d < 8; d++) {
      var dr = ALL8[d][0], df = ALL8[d][1], diag = d < 4;
      var rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        var sp = board[rr * 8 + ff];
        if (sp) {
          if (sp.c === by) {
            if (diag && (sp.t === 'b' || sp.t === 'q')) return true;
            if (!diag && (sp.t === 'r' || sp.t === 'q')) return true;
          }
          break;
        }
        rr += dr; ff += df;
      }
    }
    return false;
  }

  function inCheck(pos, c) {
    var k = findKing(pos.board, c);
    return k >= 0 && isAttacked(pos.board, k, opp(c));
  }

  function attackersOf(board, sq, by) {
    var out = [], r = Math.floor(sq / 8), f = sq % 8, i, rr, ff, p;
    var pr = by === 'w' ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) for (var k = 0; k < 2; k++) {
      var pf = f + (k === 0 ? -1 : 1);
      if (pf >= 0 && pf < 8) { p = board[pr * 8 + pf]; if (p && p.t === 'p' && p.c === by) out.push(pr * 8 + pf); }
    }
    for (var n = 0; n < 8; n++) {
      var nr = r + KNIGHT_D[n][0], nf = f + KNIGHT_D[n][1];
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
      p = board[nr * 8 + nf]; if (p && p.t === 'n' && p.c === by) out.push(nr * 8 + nf);
    }
    for (var g = 0; g < 8; g++) {
      var gr = r + KING_D[g][0], gf = f + KING_D[g][1];
      if (gr < 0 || gr > 7 || gf < 0 || gf > 7) continue;
      p = board[gr * 8 + gf]; if (p && p.t === 'k' && p.c === by) out.push(gr * 8 + gf);
    }
    for (var d = 0; d < 8; d++) {
      var dr = ALL8[d][0], df = ALL8[d][1], diag = d < 4;
      rr = r + dr; ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        p = board[rr * 8 + ff];
        if (p) {
          if (p.c === by && ((diag && (p.t === 'b' || p.t === 'q')) || (!diag && (p.t === 'r' || p.t === 'q')))) {
            out.push(rr * 8 + ff);
          }
          break;
        }
        rr += dr; ff += df;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- moves
  function pseudoMoves(pos) {
    var moves = [], b = pos.board, me = pos.turn;
    function add(from, to, extra) {
      var cap = b[to] ? b[to].t : null;
      var m = { from: from, to: to, piece: b[from].t, captured: cap, promotion: null, flags: {} };
      if (extra) for (var key in extra) m[key] = extra[key];
      if (cap) m.flags.capture = true;
      moves.push(m);
    }
    for (var i = 0; i < 64; i++) {
      var p = b[i];
      if (!p || p.c !== me) continue;
      var r = Math.floor(i / 8), f = i % 8;
      if (p.t === 'p') {
        var dir = me === 'w' ? -1 : 1;
        var startRank = me === 'w' ? 6 : 1;
        var promoRank = me === 'w' ? 0 : 7;
        var oneR = r + dir;
        if (oneR >= 0 && oneR < 8 && !b[oneR * 8 + f]) {
          if (oneR === promoRank) ['q', 'r', 'b', 'n'].forEach(function (pr) { add(i, oneR * 8 + f, { promotion: pr }); });
          else add(i, oneR * 8 + f);
          var twoR = r + 2 * dir;
          if (r === startRank && !b[twoR * 8 + f]) add(i, twoR * 8 + f, { flags: { double: true } });
        }
        for (var s = 0; s < 2; s++) {
          var cf = f + (s === 0 ? -1 : 1), cr = r + dir;
          if (cr < 0 || cr > 7 || cf < 0 || cf > 7) continue;
          var to = cr * 8 + cf, target = b[to];
          if (target && target.c !== me) {
            if (cr === promoRank) ['q', 'r', 'b', 'n'].forEach(function (pr) { add(i, to, { promotion: pr }); });
            else add(i, to);
          } else if (to === pos.ep && !target) {
            add(i, to, { flags: { ep: true, capture: true } });
          }
        }
      } else if (p.t === 'n' || p.t === 'k') {
        var D = p.t === 'n' ? KNIGHT_D : KING_D;
        for (var d = 0; d < 8; d++) {
          var nr = r + D[d][0], nf = f + D[d][1];
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
          var to2 = nr * 8 + nf, t2 = b[to2];
          if (!t2 || t2.c !== me) add(i, to2);
        }
        if (p.t === 'k') {
          var home = me === 'w' ? 60 : 4;
          if (i === home && pos.castling && !inCheck(pos, me)) {
            var rights = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
            for (var side = 0; side < 2; side++) {
              if (pos.castling.indexOf(rights[side]) < 0) continue;
              var rookFrom = side === 0 ? home + 3 : home - 4;
              var kingTo = side === 0 ? home + 2 : home - 2;
              var emptySq = side === 0 ? [home + 1, home + 2] : [home - 1, home - 2, home - 3];
              var passSq = side === 0 ? [home + 1, home + 2] : [home - 1, home - 2];
              var ok = true, e, q;
              for (e = 0; e < emptySq.length; e++) if (b[emptySq[e]]) { ok = false; break; }
              if (!ok) continue;
              var rp = b[rookFrom];
              if (!rp || rp.t !== 'r' || rp.c !== me) continue;
              for (q = 0; q < passSq.length; q++) if (isAttacked(b, passSq[q], opp(me))) { ok = false; break; }
              if (ok) add(i, kingTo, { flags: { castle: side === 0 ? 'K' : 'Q' } });
            }
          }
        }
      } else {
        var dirs = p.t === 'b' ? DIAG : p.t === 'r' ? ORTH : ALL8;
        for (var dd = 0; dd < dirs.length; dd++) {
          var rr = r + dirs[dd][0], ff = f + dirs[dd][1];
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            var to3 = rr * 8 + ff, t3 = b[to3];
            if (!t3) add(i, to3);
            else { if (t3.c !== me) add(i, to3); break; }
            rr += dirs[dd][0]; ff += dirs[dd][1];
          }
        }
      }
    }
    return moves;
  }

  function makeMove(pos, m) {
    var np = clonePos(pos), b = np.board, piece = b[m.from];
    if (!piece) throw new Error('makeMove: empty from-square ' + m.from);
    var captured = b[m.to];
    b[m.from] = null;
    if (m.flags && m.flags.ep) {
      var capSq = m.to + (piece.c === 'w' ? 8 : -8);
      captured = b[capSq];
      b[capSq] = null;
    }
    b[m.to] = m.promotion ? { t: m.promotion, c: piece.c } : piece;
    if (m.flags && m.flags.castle) {
      var home = piece.c === 'w' ? 60 : 4;
      if (m.flags.castle === 'K') { b[home + 1] = b[home + 3]; b[home + 3] = null; }
      else { b[home - 1] = b[home - 4]; b[home - 4] = null; }
      b[m.to] = piece; // king lands on g/c-file
    }
    var rights = np.castling;
    function drop(ch) { rights = rights.replace(ch, ''); }
    if (piece.t === 'k') { drop(piece.c === 'w' ? 'K' : 'k'); drop(piece.c === 'w' ? 'Q' : 'q'); }
    if (m.from === 63 || m.to === 63) drop('K');
    if (m.from === 56 || m.to === 56) drop('Q');
    if (m.from === 7 || m.to === 7) drop('k');
    if (m.from === 0 || m.to === 0) drop('q');
    np.castling = rights;
    np.ep = (m.flags && m.flags.double) ? (m.from + m.to) / 2 : -1;
    np.halfmove = (piece.t === 'p' || captured) ? 0 : pos.halfmove + 1;
    np.fullmove = pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove;
    np.turn = opp(pos.turn);
    np._captured = captured ? captured.t : null;
    return np;
  }

  function legalMoves(pos) {
    var pseudo = pseudoMoves(pos), out = [];
    for (var i = 0; i < pseudo.length; i++) {
      if (!inCheck(makeMove(pos, pseudo[i]), pos.turn)) out.push(pseudo[i]);
    }
    return out;
  }

  // ---------------------------------------------------------------- SAN
  function moveToSAN(pos, m, legal) {
    var after = makeMove(pos, m);
    if (m.flags && m.flags.castle) return (m.flags.castle === 'K' ? 'O-O' : 'O-O-O') + sanSuffix(after);
    var piece = pos.board[m.from], san = '';
    if (piece.t === 'p') {
      if (m.flags && m.flags.capture) san += FILES[m.from % 8] + 'x';
      san += sqName(m.to);
      if (m.promotion) san += '=' + m.promotion.toUpperCase();
    } else {
      san += piece.t.toUpperCase();
      var others = (legal || legalMoves(pos)).filter(function (o) {
        return o.to === m.to && o.from !== m.from && pos.board[o.from] && pos.board[o.from].t === piece.t;
      });
      if (others.length) {
        var sameFile = others.some(function (o) { return o.from % 8 === m.from % 8; });
        var sameRank = others.some(function (o) { return Math.floor(o.from / 8) === Math.floor(m.from / 8); });
        if (!sameFile) san += FILES[m.from % 8];
        else if (!sameRank) san += String(8 - Math.floor(m.from / 8));
        else san += sqName(m.from);
      }
      if (m.flags && m.flags.capture) san += 'x';
      san += sqName(m.to);
    }
    return san + sanSuffix(after);
  }

  function sanSuffix(after) {
    var legal = legalMoves(after);
    var chk = inCheck(after, after.turn);
    if (chk && legal.length === 0) return '#';
    return chk ? '+' : '';
  }

  function sanToMove(pos, san) {
    if (!san) return null;
    var clean = san.replace(/[+#!?]+$/g, '').replace(/[+#]/g, '');
    var legal = legalMoves(pos);
    for (var i = 0; i < legal.length; i++) {
      var s = moveToSAN(pos, legal[i], legal);
      if (s === san || s.replace(/[+#]/g, '') === clean) return legal[i];
    }
    var m = clean.replace(/=/, '').match(/^([a-h][1-8])([a-h][1-8])([qrbnQRBN])?$/);
    if (m) {
      var from = sqIndex(m[1].toLowerCase()), to = sqIndex(m[2].to.toLowerCase());
      var promo = m[3] ? m[3].toLowerCase() : null;
      for (var j = 0; j < legal.length; j++) {
        if (legal[j].from === from && legal[j].to === to && (!promo || legal[j].promotion === promo)) return legal[j];
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- Game
  function Game(fen) {
    this.startFen = fen || START_FEN;
    this.pos = parseFEN(this.startFen);
    this.history = [];   // { move, san, fenBefore, repetition }
    this.sans = [];
    this.positions = [positionKey(this.pos)];
  }
  Game.prototype.fen = function () { return toFEN(this.pos); };
  Game.prototype.legalMoves = function () { return legalMoves(this.pos); };
  Game.prototype.moveSAN = function (san) {
    var m = sanToMove(this.pos, san);
    if (!m) throw new Error('Illegal move: ' + san);
    return this.moveObj(m);
  };
  Game.prototype.moveObj = function (m) {
    var san = moveToSAN(this.pos, m);
    var fenBefore = this.fen();
    this.history.push({ move: m, san: san, fenBefore: fenBefore });
    this.sans.push(san);
    this.pos = makeMove(this.pos, m);
    this.positions.push(positionKey(this.pos));
    return san;
  };
  Game.prototype.undo = function () {
    var h = this.history.pop();
    if (!h) return null;
    this.sans.pop();
    this.positions.pop();
    this.pos = parseFEN(h.fenBefore);
    return h.san;
  };
  // How many times has the current position occurred (>=3 means draw claim).
  Game.prototype.repetitions = function () {
    var key = positionKey(this.pos), n = 0;
    for (var i = 0; i < this.positions.length; i++) if (this.positions[i] === key) n++;
    return n;
  };
  Game.prototype.insufficientMaterial = function () {
    var b = this.pos.board, minor = 0, bishopSq = -1, knights = 0;
    for (var i = 0; i < 64; i++) {
      var p = b[i];
      if (!p || p.t === 'k') continue;
      if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
      if (p.t === 'b') { minor++; bishopSq = (Math.floor(i / 8) + i % 8) % 2; }
      if (p.t === 'n') { minor++; knights++; }
    }
    if (minor === 0) return true;                 // K vs K
    if (minor === 1) return true;                 // K+minor vs K
    if (knights === 0 && minor === 2) return true; // KB vs KB (any colours)
    return false;
  };
  Game.prototype.status = function () {
    var legal = legalMoves(this.pos);
    var chk = inCheck(this.pos, this.pos.turn);
    if (legal.length === 0) return chk ? 'checkmate' : 'stalemate';
    if (this.pos.halfmove >= 100) return 'fifty';
    if (this.repetitions() >= 3) return 'repetition';
    if (this.insufficientMaterial()) return 'material';
    return chk ? 'check' : 'playing';
  };
  Game.prototype.isOver = function () {
    var s = this.status();
    return s === 'checkmate' || s === 'stalemate' || s === 'fifty' || s === 'repetition' || s === 'material';
  };
  Game.prototype.winner = function () {
    return this.status() === 'checkmate' ? opp(this.pos.turn) : null;
  };

  // ---------------------------------------------------------------- PGN
  function parsePGN(pgn) {
    if (typeof pgn !== 'string') throw new Error('PGN must be a string');
    var headers = {}, tm;
    var tagRe = /\[(\w+)\s+"([^"]*)"\]/g;
    while ((tm = tagRe.exec(pgn))) headers[tm[1]] = tm[2];
    // Strip tags, comments, variations and NAGs before tokenising.
    var body = pgn.replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/;[^\n]*/g, ' ')
      .replace(/\([^()]*\)/g, ' ')
      .replace(/\$\d+/g, ' ');
    // Keep only move-ish tokens.
    var tokens = body.split(/\s+/).filter(function (t) { return t; });
    var game = new Game(headers.FEN || START_FEN);
    var sans = [], errors = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i]
        .replace(/^\d+\.(\.\.)?/, '')
        .replace(/^\.+/, '')
        .trim();
      if (!tok) continue;
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
      if (/^\d+\.+$/.test(tok)) continue;
      if (/^[a-h][1-8][a-h][1-8]/.test(tok) || /^[KQRBNOa-h]/.test(tok)) {
        try { sans.push(game.moveSAN(tok)); }
        catch (e) { errors.push({ token: tok, ply: i, message: e.message }); break; }
      }
    }
    return { game: game, sans: sans, headers: headers, errors: errors };
  }

  function toPGN(game, headers) {
    var h = headers || {};
    var tags = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result',
      'WhiteElo', 'BlackElo', 'TimeControl', 'ECO', 'Opening', 'Termination'];
    var out = '';
    for (var i = 0; i < tags.length; i++) {
      if (h[tags[i]] != null && h[tags[i]] !== '') out += '[' + tags[i] + ' "' + String(h[tags[i]]).replace(/"/g, "'") + '"]\n';
    }
    if (!h.Result) out += '[Result "' + (game.status() === 'checkmate' ? (game.winner() === 'w' ? '1-0' : '0-1') : '*') + '"]\n';
    if (out) out += '\n';
    var line = '';
    for (var p = 0; p < game.sans.length; p++) {
      if (p % 2 === 0) line += (p / 2 + 1) + '. ';
      line += game.sans[p] + ' ';
      if (line.length > 76) { out += line.trim() + '\n'; line = ''; }
    }
    out += line.trim();
    var res = h.Result || (game.status() === 'checkmate' ? (game.winner() === 'w' ? '1-0' : '0-1') : '*');
    return (out + ' ' + res).trim();
  }

  // ---------------------------------------------------------------- evaluation
  // Piece-square tables are written from White's point of view, rank 8 first,
  // so index 0 = a8 — the same orientation as the board array.
  var PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
        5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0,
        5, -5, -10, 0, 0, -10, -5, 5,
        5, 10, 10, -20, -20, 10, 10, 5,
        0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0,
        10, 15, 15, 15, 15, 15, 15, 10,
        -5, 0, 0, 5, 5, 0, 0, -5,
        -5, 0, 0, 5, 5, 0, 0, -5,
        -5, 0, 0, 5, 5, 0, 0, -5,
        -5, 0, 0, 5, 5, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        0, 0, 5, 10, 10, 5, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5,
        -10, 5, 5, 5, 5, 5, 0, -10,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -10, -20, -20, -20, -20, -20, -20, -10,
        20, 20, 0, 0, 0, 0, 20, 20,
        20, 30, 10, 0, 0, 10, 30, 20]
  };

  var DEFAULT_WEIGHTS = {
    mobility: 0,          // reserved (legal-move counting is too slow per node)
    bishopPair: 30,
    doubledPawn: -14,
    isolatedPawn: -16,
    passedPawn: [0, 6, 12, 22, 38, 60, 90, 0],
    rookOpenFile: 18,
    rookSemiOpen: 9,
    kingShield: 12,
    tempo: 6,
    contempt: 0
  };

  function pawnFiles(board, c) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0], rows = [], i, p;
    for (i = 0; i < 64; i++) {
      p = board[i];
      if (p && p.t === 'p' && p.c === c) {
        var f = i % 8;
        counts[f]++;
        rows.push({ f: f, r: Math.floor(i / 8) });
      }
    }
    return { counts: counts, list: rows };
  }

  function evaluate(pos, weights, values) {
    var w = weights || DEFAULT_WEIGHTS;
    var v = values || VAL;
    var b = pos.board, i, p, score = 0;
    var bishops = { w: 0, b: 0 }, pieceCount = 0;

    for (i = 0; i < 64; i++) {
      p = b[i];
      if (!p) continue;
      pieceCount++;
      var idx = p.c === 'w' ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8);
      var pv = (v[p.t] || VAL[p.t]) + PST[p.t][idx];
      score += p.c === 'w' ? pv : -pv;
      if (p.t === 'b') bishops[p.c]++;
    }

    if (bishops.w >= 2) score += w.bishopPair;
    if (bishops.b >= 2) score -= w.bishopPair;

    var wp = pawnFiles(b, 'w'), bp = pawnFiles(b, 'b');

    // doubled + isolated pawns
    for (var f = 0; f < 8; f++) {
      if (wp.counts[f] > 1) score += w.doubledPawn * (wp.counts[f] - 1);
      if (bp.counts[f] > 1) score -= w.doubledPawn * (bp.counts[f] - 1);
      var wIso = wp.counts[f] > 0 && (f === 0 || !wp.counts[f - 1]) && (f === 7 || !wp.counts[f + 1]);
      var bIso = bp.counts[f] > 0 && (f === 0 || !bp.counts[f - 1]) && (f === 7 || !bp.counts[f + 1]);
      if (wIso) score += w.isolatedPawn;
      if (bIso) score -= w.isolatedPawn;
    }

    // passed pawns
    function passed(list, enemyCounts, dir) {
      var total = 0;
      for (var k = 0; k < list.length; k++) {
        var pf = list[k].f, pr = list[k].r, free = true;
        for (var df = -1; df <= 1 && free; df++) {
          var ff = pf + df;
          if (ff < 0 || ff > 7) continue;
          if (enemyCounts[ff] === 0) continue;
          free = false;
        }
        if (!free) continue;
        var rank = dir === 'w' ? 7 - pr : pr; // distance advanced
        total += w.passedPawn[Math.max(0, Math.min(7, rank))] || 0;
      }
      return total;
    }
    score += passed(wp.list, bp.counts, 'w');
    score -= passed(bp.list, wp.counts, 'b');

    // rooks on open / semi-open files
    for (i = 0; i < 64; i++) {
      p = b[i];
      if (!p || p.t !== 'r') continue;
      var file = i % 8;
      var own = p.c === 'w' ? wp.counts : bp.counts;
      var enemy = p.c === 'w' ? bp.counts : wp.counts;
      if (own[file] === 0 && enemy[file] === 0) score += (p.c === 'w' ? 1 : -1) * w.rookOpenFile;
      else if (own[file] === 0) score += (p.c === 'w' ? 1 : -1) * w.rookSemiOpen;
    }

    // king pawn shield (only meaningful with queens on)
    if (pos.halfmove < 40) {
      var kw = findKing(b, 'w'), kb = findKing(b, 'b');
      if (kw >= 0) {
        var kf = kw % 8, kr = Math.floor(kw / 8), shield = 0;
        for (var sf = Math.max(0, kf - 1); sf <= Math.min(7, kf + 1); sf++) {
          for (var sr = kr + 1; sr <= Math.min(7, kr + 2); sr++) {
            var sp = b[sr * 8 + sf];
            if (sp && sp.t === 'p' && sp.c === 'w') { shield++; break; }
          }
        }
        score += (shield - 2) * w.kingShield;
      }
      if (kb >= 0) {
        var bf = kb % 8, br = Math.floor(kb / 8), bshield = 0;
        for (var s2 = Math.max(0, bf - 1); s2 <= Math.min(7, bf + 1); s2++) {
          for (var r2 = Math.max(0, br - 2); r2 <= br - 1; r2++) {
            var sp2 = b[r2 * 8 + s2];
            if (sp2 && sp2.t === 'p' && sp2.c === 'b') { bshield++; break; }
          }
        }
        score -= (bshield - 2) * w.kingShield;
      }
    }

    // side-to-move tempo
    score += pos.turn === 'w' ? w.tempo : -w.tempo;

    return Math.round(score);
  }

  // ---------------------------------------------------------------- search
  function orderMoves(moves, ttMove, killers) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], s = 0;
      if (ttMove && m.from === ttMove.from && m.to === ttMove.to && m.promotion === ttMove.promotion) s += 100000;
      if (m.captured) s += 10000 + 10 * VAL[m.captured] - VAL[m.piece];
      if (m.promotion) s += 9000 + VAL[m.promotion];
      if (killers) {
        for (var k = 0; k < killers.length; k++) {
          if (killers[k] && killers[k].from === m.from && killers[k].to === m.to) s += 800 - k * 50;
        }
      }
      m._order = s;
    }
    moves.sort(function (a, b) { return b._order - a._order; });
    return moves;
  }

  function analyse(pos, opts) {
    opts = opts || {};
    var maxDepth = Math.max(1, Math.min(8, opts.depth || 3));
    // Safety valve: without an explicit limit, deep searches still stop in time.
    var timeMs = opts.timeMs || (maxDepth >= 6 ? 8000 : maxDepth >= 5 ? 4000 : 0);
    var multipv = Math.max(1, Math.min(8, opts.multipv || 5));
    var weights = opts.weights ? Object.assign({}, DEFAULT_WEIGHTS, opts.weights) : DEFAULT_WEIGHTS;
    var values = opts.pieceValues ? Object.assign({}, VAL, opts.pieceValues) : VAL;
    var randomness = Math.max(0, opts.randomness || 0);
    var blunderChance = Math.max(0, Math.min(50, opts.blunderChance || 0));
    var contempt = opts.contempt || 0;
    var start = Date.now();
    var ctx = { nodes: 0, tt: new Map(), killers: {}, cancelled: false, deadline: timeMs > 0 ? start + timeMs : 0 };

    function outOfTime() {
      if (!ctx.deadline) return false;
      if (ctx.nodes % 512 !== 0) return false;
      if (Date.now() > ctx.deadline) { ctx.cancelled = true; return true; }
      return false;
    }

    function quiesce(p, alpha, beta, ply) {
      ctx.nodes++;
      if (outOfTime()) return 0;
      var stand = (p.turn === 'w' ? 1 : -1) * evaluate(p, weights, values);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply >= 8) return alpha;
      var caps = [];
      var pseudo = pseudoMoves(p);
      for (var i = 0; i < pseudo.length; i++) {
        var m = pseudo[i];
        // Include captures and queen promotions; skip quiet moves.
        if (m.captured || (m.promotion && m.promotion === 'q')) {
          if (!inCheck(makeMove(p, m), p.turn)) caps.push(m);
        }
      }
      orderMoves(caps);
      for (var j = 0; j < caps.length; j++) {
        var sc = -quiesce(makeMove(p, caps[j]), -beta, -alpha, ply + 1);
        if (ctx.cancelled) return alpha;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }

    function search(p, depth, alpha, beta, ply) {
      ctx.nodes++;
      if (outOfTime()) return 0;

      if (ply > 0 && p.halfmove >= 100) return 0;

      var key = positionKey(p) + '|' + depth;
      var cached = ctx.tt.get(key);
      if (cached != null && ply > 0) return cached;

      if (depth <= 0) return quiesce(p, alpha, beta, ply);

      var moves = legalMoves(p);
      if (moves.length === 0) return inCheck(p, p.turn) ? -MATE + ply : 0;

      var ttEntry = ctx.tt.get(positionKey(p));
      var killers = ctx.killers[ply] || (ctx.killers[ply] = []);
      orderMoves(moves, ttEntry, killers);

      var best = -Infinity, bestMove = null, originalAlpha = alpha;
      for (var i = 0; i < moves.length; i++) {
        var score;
        if (i === 0) {
          score = -search(makeMove(p, moves[i]), depth - 1, -beta, -alpha, ply + 1);
        } else {
          score = -search(makeMove(p, moves[i]), depth - 1, -alpha - 1, -alpha, ply + 1);
          if (score > alpha && score < beta) score = -search(makeMove(p, moves[i]), depth - 1, -beta, -alpha, ply + 1);
        }
        if (ctx.cancelled) return alpha;
        if (score > best) { best = score; bestMove = moves[i]; }
        if (best > alpha) alpha = best;
        if (alpha >= beta) {
          if (!moves[i].captured) {
            killers.unshift(moves[i]);
            killers.length = Math.min(killers.length, 2);
          }
          break;
        }
      }
      // Only cache fully-searched nodes.
      if (best <= originalAlpha || true) {
        ctx.tt.set(key, best);
        if (bestMove) ctx.tt.set(positionKey(p), bestMove);
        if (ctx.tt.size > 200000) ctx.tt.clear();
      }
      return best;
    }

    var rootMoves = legalMoves(pos);
    var scored = rootMoves.map(function (m) {
      return { move: m, san: moveToSAN(pos, m, rootMoves), score: 0, pv: [moveToSAN(pos, m, rootMoves)] };
    });
    if (!scored.length) {
      return { moves: [], whiteScore: inCheck(pos, pos.turn) ? (pos.turn === 'w' ? -MATE : MATE) : 0,
        nodes: 0, depth: 0, timeMs: 0, mate: null, finished: true };
    }

    var completed = 1;
    for (var d = 1; d <= maxDepth; d++) {
      var alphaRoot = -Infinity;
      var round = [];
      for (var i = 0; i < scored.length; i++) {
        var mv = scored[i].move;
        var sc = -search(makeMove(pos, mv), d - 1, -Infinity, -alphaRoot, 1);
        if (ctx.cancelled) break;
        if (d === maxDepth) {
          if (randomness > 0) sc += Math.round((Math.random() * 2 - 1) * randomness);
          if (contempt) sc += pos.turn === 'w' ? contempt : -contempt;
        }
        round.push({ move: mv, san: scored[i].san, score: sc, pv: [scored[i].san] });
        if (sc > alphaRoot) alphaRoot = sc;
      }
      if (ctx.cancelled) break;
      round.sort(function (a, b) { return b.score - a.score; });
      scored = round;
      completed = d;
      if (blunderChance > 0 && round.length > 1 && Math.random() * 100 < blunderChance) {
        // Simulate a human slip: swap the best move aside for a random legal one.
        var pick = 1 + Math.floor(Math.random() * Math.min(4, round.length - 1));
        var tmp = round[0]; round[0] = round[pick]; round[pick] = tmp;
      }
      // Stop early on a proven mate.
      if (Math.abs(scored[0].score) > MATE - 200) break;
      if (ctx.deadline && Date.now() > ctx.deadline) break;
    }

    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, multipv);
    var bestScore = top.length ? top[0].score : 0;
    var whiteScore = pos.turn === 'w' ? bestScore : -bestScore;
    var mate = null;
    if (Math.abs(bestScore) > MATE - 1000) {
      var plies = MATE - Math.abs(bestScore);
      mate = Math.ceil(plies / 2) * (bestScore > 0 ? 1 : -1);
      whiteScore = pos.turn === 'w' ? bestScore : -bestScore;
    }
    return {
      moves: top, whiteScore: whiteScore, nodes: ctx.nodes, depth: completed,
      timeMs: Date.now() - start, mate: mate, finished: !ctx.cancelled
    };
  }

  // Backwards-compatible helper used by older call sites / tests.
  function findBestMoves(pos, depth) {
    return analyse(pos, { depth: depth || 3, multipv: 5 });
  }

  // ---------------------------------------------------------------- perft
  function perft(pos, depth) {
    if (depth === 0) return 1;
    var moves = legalMoves(pos), total = 0;
    if (depth === 1) return moves.length;
    for (var i = 0; i < moves.length; i++) total += perft(makeMove(pos, moves[i]), depth - 1);
    return total;
  }

  // ---------------------------------------------------------------- review
  // Accuracy model: win-probability delta per move (Lichess-style), which is far
  // more meaningful than raw centipawn loss. Scale is our own.
  function winProbability(cp) {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }
  function moveAccuracy(cpBefore, cpAfter, moverIsWhite) {
    var wBefore = winProbability(moverIsWhite ? cpBefore : -cpBefore);
    var wAfter = winProbability(moverIsWhite ? cpAfter : -cpAfter);
    var drop = Math.max(0, wBefore - wAfter);
    var acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
    return Math.max(0, Math.min(100, acc));
  }

  var DEFAULT_REVIEW = {
    depth: 2, timePerMove: 0,
    blunderCp: 150, mistakeCp: 70, inaccuracyCp: 30, greatCp: 0,
    moveTimeMs: 0
  };

  // Mate scores compress badly when subtracted, so clamp them first.
  function clampEval(cp) {
    if (cp == null) return 0;
    if (cp > MATE - 1000) return MATE - 1000;
    if (cp < -(MATE - 1000)) return -(MATE - 1000);
    return cp;
  }

  function classify(loss, bestWasOnly, opts) {
    var o = Object.assign({}, DEFAULT_REVIEW, opts || {});
    if (bestWasOnly) return 'best';
    if (loss >= o.blunderCp * 2) return 'blunder';
    if (loss >= o.blunderCp) return 'blunder';
    if (loss >= o.mistakeCp) return 'mistake';
    if (loss >= o.inaccuracyCp) return 'inaccuracy';
    if (loss <= 10) return 'best';
    if (loss <= 25) return 'good';
    return 'ok';
  }

  function reviewGame(fen, sans, opts, onProgress) {
    var o = Object.assign({}, DEFAULT_REVIEW, opts || {});
    var game = new Game(fen || START_FEN);
    var rows = [];
    var total = sans.length;
    for (var i = 0; i < total; i++) {
      var before = game.pos;
      var side = before.turn;
      var pre = analyse(before, { depth: o.depth, timeMs: o.moveTimeMs, multipv: 3 });
      var bestSan = pre.moves[0] ? pre.moves[0].san : null;
      var playedSan;
      try { playedSan = game.moveSAN(sans[i]); } catch (e) { break; }
      var post = analyse(game.pos, { depth: o.depth, timeMs: o.moveTimeMs, multipv: 1 });
      var bestForMover = clampEval(side === 'w' ? pre.whiteScore : -pre.whiteScore);
      var afterForMover = clampEval(side === 'w' ? -post.whiteScore : post.whiteScore);
      var loss = Math.max(0, bestForMover - afterForMover);
      // Playing the engine's own first choice can never be an error.
      var cls = classify(loss, bestSan === playedSan, o);
      if (bestSan === playedSan) loss = 0;
      var acc = moveAccuracy(pre.whiteScore, post.whiteScore, side === 'w');
      rows.push({
        ply: i, san: playedSan, side: side, fenBefore: toFEN(before),
        evalBefore: pre.whiteScore, evalAfter: post.whiteScore,
        best: bestSan, bestLine: pre.moves.slice(0, 3).map(function (m) { return m.san; }),
        loss: loss, classification: cls, accuracy: acc
      });
      if (onProgress && (i % 2 === 0 || i === total - 1)) {
        onProgress({ done: i + 1, total: total, row: rows[rows.length - 1] });
      }
    }

    function summarise(side) {
      var mine = rows.filter(function (r) { return r.side === side; });
      if (!mine.length) return { accuracy: 0, blunders: 0, mistakes: 0, inaccuracies: 0, best: 0, count: 0 };
      var acc = mine.reduce(function (a, r) { return a + r.accuracy; }, 0) / mine.length;
      return {
        accuracy: Math.round(acc * 10) / 10,
        blunders: mine.filter(function (r) { return r.classification === 'blunder'; }).length,
        mistakes: mine.filter(function (r) { return r.classification === 'mistake'; }).length,
        inaccuracies: mine.filter(function (r) { return r.classification === 'inaccuracy'; }).length,
        best: mine.filter(function (r) { return r.classification === 'best'; }).length,
        count: mine.length
      };
    }

    return { rows: rows, white: summarise('w'), black: summarise('b'), depth: o.depth };
  }

  // ---------------------------------------------------------------- openings
  var BOOK = [
    { line: 'e4', name: "King's Pawn Opening" },
    { line: 'e4 e5', name: 'Open Game' },
    { line: 'e4 e5 Nf3', name: 'King\'s Knight Opening' },
    { line: 'e4 e5 Nf3 Nc6', name: 'Open Game' },
    { line: 'e4 e5 Nf3 Nc6 Bb5', name: 'Ruy Lopez' },
    { line: 'e4 e5 Nf3 Nc6 Bb5 a6', name: 'Ruy Lopez, Morphy Defense' },
    { line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', name: 'Ruy Lopez, Closed' },
    { line: 'e4 e5 Nf3 Nc6 Bc4', name: 'Italian Game' },
    { line: 'e4 e5 Nf3 Nc6 Bc4 Bc5', name: 'Italian Game, Giuoco Piano' },
    { line: 'e4 e5 Nf3 Nc6 Bc4 Nf6', name: 'Italian Game, Two Knights' },
    { line: 'e4 e5 Nf3 Nc6 d4', name: 'Scotch Game' },
    { line: 'e4 e5 f4', name: "King's Gambit" },
    { line: 'e4 e5 Nc3', name: 'Vienna Game' },
    { line: 'e4 e5 Bc4', name: 'Bishop\'s Opening' },
    { line: 'e4 c5', name: 'Sicilian Defense' },
    { line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', name: 'Sicilian, Najdorf' },
    { line: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4', name: 'Sicilian, Open' },
    { line: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4', name: 'Sicilian, Kan' },
    { line: 'e4 c5 Nc3', name: 'Sicilian, Closed' },
    { line: 'e4 c5 c3', name: 'Sicilian, Alapin' },
    { line: 'e4 e6', name: 'French Defense' },
    { line: 'e4 e6 d4 d5 Nc3', name: 'French, Main Line' },
    { line: 'e4 c6', name: 'Caro-Kann Defense' },
    { line: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', name: 'Caro-Kann, Classical' },
    { line: 'e4 d5', name: 'Scandinavian Defense' },
    { line: 'e4 Nf6', name: 'Alekhine Defense' },
    { line: 'e4 d6', name: 'Pirc Defense' },
    { line: 'e4 g6', name: 'Modern Defense' },
    { line: 'd4', name: "Queen's Pawn Opening" },
    { line: 'd4 d5', name: 'Closed Game' },
    { line: 'd4 d5 c4', name: "Queen's Gambit" },
    { line: 'd4 d5 c4 e6', name: "Queen's Gambit Declined" },
    { line: 'd4 d5 c4 dxc4', name: "Queen's Gambit Accepted" },
    { line: 'd4 d5 c4 c6', name: 'Slav Defense' },
    { line: 'd4 d5 Bf4', name: 'London System' },
    { line: 'd4 Nf6', name: 'Indian Defense' },
    { line: 'd4 Nf6 c4 e6 Nc3 Bb4', name: 'Nimzo-Indian Defense' },
    { line: 'd4 Nf6 c4 g6', name: "King's Indian Defense" },
    { line: 'd4 Nf6 c4 e6 Nf3 b6', name: "Queen's Indian Defense" },
    { line: 'd4 f5', name: 'Dutch Defense' },
    { line: 'd4 e6', name: 'Horwitz Defense' },
    { line: 'c4', name: 'English Opening' },
    { line: 'c4 e5', name: 'English, Reversed Sicilian' },
    { line: 'c4 c5', name: 'English, Symmetrical' },
    { line: 'Nf3 d5', name: 'Réti Opening' },
    { line: 'Nf3 Nf6 c4', name: 'Réti / English' },
    { line: 'g3', name: "Benko / King's Fianchetto" },
    { line: 'b3', name: 'Nimzo-Larsen Attack' },
    { line: 'f4', name: "Bird's Opening" },
    { line: 'b4', name: 'Polish Opening' }
  ];

  var ECO = [
    { code: 'C65', name: 'Ruy Lopez' }, { code: 'C50', name: 'Italian Game' },
    { code: 'B90', name: 'Sicilian, Najdorf' }, { code: 'B20', name: 'Sicilian Defense' },
    { code: 'C00', name: 'French Defense' }, { code: 'B12', name: 'Caro-Kann' },
    { code: 'D30', name: "Queen's Gambit Declined" }, { code: 'D20', name: "Queen's Gambit Accepted" },
    { code: 'D10', name: 'Slav Defense' }, { code: 'A45', name: 'Indian Defense' },
    { code: 'E60', name: "King's Indian Defense" }, { code: 'E20', name: 'Nimzo-Indian' },
    { code: 'A80', name: 'Dutch Defense' }, { code: 'A10', name: 'English Opening' },
    { code: 'B01', name: 'Scandinavian Defense' }, { code: 'C30', name: "King's Gambit" },
    { code: 'D02', name: 'London System' }, { code: 'A01', name: 'Réti Opening' }
  ];

  function lookupOpening(sans) {
    var seq = sans.join(' ');
    var best = null;
    for (var i = 0; i < BOOK.length; i++) {
      var b = BOOK[i];
      if (seq === b.line || b.line.indexOf(seq + ' ') === 0 || (seq + ' ').indexOf(b.line + ' ') === 0) {
        if (!best || b.line.length > best.line.length) best = b;
      }
    }
    if (!best) return null;
    var eco = ECO.filter(function (e) { return best.name.indexOf(e.name.split(',')[0]) === 0; })[0];
    return { name: best.name, line: best.line, eco: eco ? eco.code : null };
  }

  // ---------------------------------------------------------------- exports
  var api = {
    START_FEN: START_FEN, MATE: MATE, VAL: VAL, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    parseFEN: parseFEN, toFEN: toFEN, clonePos: clonePos, positionKey: positionKey,
    legalMoves: legalMoves, pseudoMoves: pseudoMoves, makeMove: makeMove,
    moveToSAN: moveToSAN, sanToMove: sanToMove, inCheck: inCheck, isAttacked: isAttacked,
    attackersOf: attackersOf, findKing: findKing, perft: perft,
    Game: Game, parsePGN: parsePGN, toPGN: toPGN,
    evaluate: evaluate, analyse: analyse, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, findBestMoves: findBestMoves,
    reviewGame: reviewGame, winProbability: winProbability, moveAccuracy: moveAccuracy,
    lookupOpening: lookupOpening, sqName: sqName, sqIndex: sqIndex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChessCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
