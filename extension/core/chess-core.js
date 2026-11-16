/* Chess Coach — chess core (rules, FEN, PGN, built-in engine)
 * Self-contained, no dependencies. Works in browser (window.ChessCore)
 * and Node (module.exports) for tests.
 * Board: array of 64, index 0 = a8 ... 63 = h1.
 * Piece: { t: 'p'|'n'|'b'|'r'|'q'|'k', c: 'w'|'b' }
 */
(function (root) {
  'use strict';

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var FILES = 'abcdefgh';

  function sqName(i) { return FILES[i % 8] + (8 - Math.floor(i / 8)); }
  function sqIndex(name) { return (8 - parseInt(name[1], 10)) * 8 + FILES.indexOf(name[0]); }
  function colorOf(p) { return p ? p.c : null; }
  function opp(c) { return c === 'w' ? 'b' : 'w'; }

  // ---------- FEN ----------
  function parseFEN(fen) {
    var parts = fen.trim().split(/\s+/);
    var rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Invalid FEN: expected 8 ranks');
    var board = new Array(64).fill(null);
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (/\d/.test(ch)) { f += parseInt(ch, 10); continue; }
        var c = ch === ch.toUpperCase() ? 'w' : 'b';
        board[r * 8 + f] = { t: ch.toLowerCase(), c: c };
        f++;
      }
      if (f !== 8) throw new Error('Invalid FEN rank ' + (8 - r));
    }
    var castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
    return {
      board: board,
      turn: parts[1] === 'b' ? 'b' : 'w',
      castling: castling,
      ep: parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1,
      halfmove: parseInt(parts[4] || '0', 10),
      fullmove: parseInt(parts[5] || '1', 10)
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
    out += ' ' + pos.turn + ' ' + (pos.castling || '-') + ' ' +
      (pos.ep >= 0 ? sqName(pos.ep) : '-') + ' ' + pos.halfmove + ' ' + pos.fullmove;
    return out;
  }

  function clonePos(pos) {
    return {
      board: pos.board.map(function (p) { return p ? { t: p.t, c: p.c } : null; }),
      turn: pos.turn, castling: pos.castling, ep: pos.ep,
      halfmove: pos.halfmove, fullmove: pos.fullmove
    };
  }

  // ---------- Attack detection ----------
  var KNIGHT_D = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  var KING_D = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  var DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
  var ORTH = [[-1,0],[1,0],[0,-1],[0,1]];

  function findKing(board, c) {
    for (var i = 0; i < 64; i++) if (board[i] && board[i].t === 'k' && board[i].c === c) return i;
    return -1;
  }

  function isAttacked(board, sq, by) {
    var r = Math.floor(sq / 8), f = sq % 8;
    // pawns
    var pr = by === 'w' ? r + 1 : r - 1; // white pawns attack upward (decreasing r), so attacker sits below
    if (pr >= 0 && pr < 8) {
      for (var k = 0; k < 2; k++) {
        var pf = f + (k === 0 ? -1 : 1);
        if (pf < 0 || pf > 7) continue;
        var p = board[pr * 8 + pf];
        if (p && p.t === 'p' && p.c === by) return true;
      }
    }
    // knights
    for (var n = 0; n < 8; n++) {
      var nr = r + KNIGHT_D[n][0], nf = f + KNIGHT_D[n][1];
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
      var np = board[nr * 8 + nf];
      if (np && np.t === 'n' && np.c === by) return true;
    }
    // king
    for (var g = 0; g < 8; g++) {
      var gr = r + KING_D[g][0], gf = f + KING_D[g][1];
      if (gr < 0 || gr > 7 || gf < 0 || gf > 7) continue;
      var gp = board[gr * 8 + gf];
      if (gp && gp.t === 'k' && gp.c === by) return true;
    }
    // sliders
    var dirs = DIAG.concat(ORTH);
    for (var d = 0; d < 8; d++) {
      var dr = dirs[d][0], df = dirs[d][1], diag = d < 4;
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

  // ---------- Move generation ----------
  function pseudoMoves(pos) {
    var moves = [];
    var b = pos.board, me = pos.turn;
    function add(from, to, extra) {
      var m = { from: from, to: to, piece: b[from].t, captured: b[to] ? b[to].t : null, promotion: null, flags: {} };
      if (extra) for (var k in extra) m[k] = extra[k];
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
          if (oneR === promoRank) {
            ['q','r','b','n'].forEach(function (pr) { add(i, oneR * 8 + f, { promotion: pr }); });
          } else add(i, oneR * 8 + f);
          var twoR = r + 2 * dir;
          if (r === startRank && !b[twoR * 8 + f]) add(i, twoR * 8 + f, { flags: { double: true } });
        }
        for (var s = 0; s < 2; s++) {
          var cf = f + (s === 0 ? -1 : 1), cr = r + dir;
          if (cr < 0 || cr > 7 || cf < 0 || cf > 7) continue;
          var to = cr * 8 + cf, target = b[to];
          if (target && target.c !== me) {
            if (cr === promoRank) ['q','r','b','n'].forEach(function (pr) { add(i, to, { promotion: pr }); });
            else add(i, to, { flags: { capture: true } });
          } else if (to === pos.ep) {
            add(i, to, { flags: { capture: true, ep: true } });
          }
        }
      } else if (p.t === 'n' || p.t === 'k') {
        var D = p.t === 'n' ? KNIGHT_D : KING_D;
        for (var d = 0; d < 8; d++) {
          var nr = r + D[d][0], nf = f + D[d][1];
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
          var to2 = nr * 8 + nf, t2 = b[to2];
          if (!t2 || t2.c !== me) add(i, to2, t2 ? { flags: { capture: true } } : null);
        }
        if (p.t === 'k') {
          // castling
          var home = me === 'w' ? 60 : 4;
          if (i === home && !inCheck(pos, me)) {
            var rights = me === 'w' ? ['K','Q'] : ['k','q'];
            for (var side = 0; side < 2; side++) {
              if (pos.castling.indexOf(rights[side]) < 0) continue;
              var rookFrom = side === 0 ? home + 3 : home - 4;
              var rookTo = side === 0 ? home + 1 : home - 1;
              var emptySq = side === 0 ? [home + 1, home + 2] : [home - 1, home - 2, home - 3];
              var passSq = side === 0 ? [home + 1, home + 2] : [home - 1, home - 2];
              var ok = true;
              for (var e = 0; e < emptySq.length; e++) if (b[emptySq[e]]) { ok = false; break; }
              if (!ok) continue;
              var rp = b[rookFrom];
              if (!rp || rp.t !== 'r' || rp.c !== me) continue;
              for (var q = 0; q < passSq.length; q++) if (isAttacked(b, passSq[q], opp(me))) { ok = false; break; }
              if (ok) add(i, rookTo, { flags: { castle: side === 0 ? 'K' : 'Q' } });
            }
          }
        }
      } else {
        var dirs = p.t === 'b' ? DIAG : p.t === 'r' ? ORTH : KING_D;
        for (var dd = 0; dd < dirs.length; dd++) {
          var rr = r + dirs[dd][0], ff = f + dirs[dd][1];
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            var to3 = rr * 8 + ff, t3 = b[to3];
            if (!t3) add(i, to3);
            else { if (t3.c !== me) add(i, to3, { flags: { capture: true } }); break; }
            rr += dirs[dd][0]; ff += dirs[dd][1];
          }
        }
      }
    }
    return moves;
  }

  function makeMove(pos, m) {
    var np = clonePos(pos);
    var b = np.board, piece = b[m.from];
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
    }
    // update castling rights
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
    return np;
  }

  function legalMoves(pos) {
    return pseudoMoves(pos).filter(function (m) {
      return !inCheck(makeMove(pos, m), pos.turn);
    });
  }

  function moveToSAN(pos, m, legal) {
    if (m.flags && m.flags.castle) {
      var base = m.flags.castle === 'K' ? 'O-O' : 'O-O-O';
      var after = makeMove(pos, m);
      return base + sanSuffix(after);
    }
    var piece = pos.board[m.from];
    var san = '';
    if (piece.t === 'p') {
      if (m.flags && m.flags.capture) san += FILES[m.from % 8] + 'x';
      san += sqName(m.to);
      if (m.promotion) san += '=' + m.promotion.toUpperCase();
    } else {
      san += piece.t.toUpperCase().replace('N', 'N');
      // disambiguation
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
    return san + sanSuffix(makeMove(pos, m));
  }

  function sanSuffix(after) {
    var oppLegal = legalMoves(after);
    var chk = inCheck(after, after.turn);
    if (chk && oppLegal.length === 0) return '#';
    if (chk) return '+';
    return '';
  }

  function sanToMove(pos, san) {
    var clean = san.replace(/[+#]/g, '');
    var legal = legalMoves(pos);
    for (var i = 0; i < legal.length; i++) {
      if (moveToSAN(pos, legal[i], legal) === san || moveToSAN(pos, legal[i], legal).replace(/[+#]/g, '') === clean) return legal[i];
    }
    // try coordinate / long algebraic
    var m = clean.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
    if (m) {
      var from = sqIndex(m[1].toLowerCase()), to = sqIndex(m[2].toLowerCase());
      for (var j = 0; j < legal.length; j++) {
        if (legal[j].from === from && legal[j].to === to && (!m[3] || legal[j].promotion === m[3].toLowerCase())) return legal[j];
      }
    }
    return null;
  }

  // ---------- Game ----------
  function Game(fen) {
    this.pos = parseFEN(fen || START_FEN);
    this.history = []; // {move, san, fenBefore}
    this.sans = [];
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
    this.history.push({ move: m, san: san, fenBefore: this.fen() });
    this.sans.push(san);
    this.pos = makeMove(this.pos, m);
    return san;
  };
  Game.prototype.undo = function () {
    var h = this.history.pop();
    if (!h) return null;
    this.sans.pop();
    this.pos = parseFEN(h.fenBefore);
    return h.san;
  };
  Game.prototype.status = function () {
    var legal = legalMoves(this.pos);
    var chk = inCheck(this.pos, this.pos.turn);
    if (legal.length === 0) return chk ? 'checkmate' : 'stalemate';
    if (this.pos.halfmove >= 100) return 'draw';
    // insufficient material
    var pieces = this.pos.board.filter(Boolean);
    var nonKings = pieces.filter(function (p) { return p.t !== 'k'; });
    if (nonKings.length === 0) return 'draw';
    if (nonKings.length === 1 && (nonKings[0].t === 'b' || nonKings[0].t === 'n')) return 'draw';
    return chk ? 'check' : 'playing';
  };
  Game.prototype.winner = function () {
    var s = this.status();
    if (s === 'checkmate') return opp(this.pos.turn);
    return null;
  };

  // ---------- PGN ----------
  function parsePGN(pgn) {
    var headers = {};
    var tagRe = /\[(\w+)\s+"([^"]*)"\]/g, tm;
    while ((tm = tagRe.exec(pgn))) headers[tm[1]] = tm[2];
    var body = pgn.replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/;\S.*$/gm, ' ');
    var tokens = body.split(/\s+/).filter(function (t) {
      return t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\d+\.\.\.$/.test(t);
    });
    var game = new Game(headers.FEN || START_FEN);
    var sans = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i].replace(/^\d+\.(\.\.)?/, '');
      if (!tok) continue;
      try { sans.push(game.moveSAN(tok)); } catch (e) { break; }
    }
    return { game: game, sans: sans, headers: headers };
  }

  function toPGN(game, headers) {
    var out = '';
    var h = headers || {};
    ['Event','Site','Date','White','Black','Result'].forEach(function (k) {
      if (h[k]) out += '[' + k + ' "' + h[k] + '"]\n';
    });
    if (out) out += '\n';
    for (var i = 0; i < game.sans.length; i++) {
      if (i % 2 === 0) out += (i / 2 + 1) + '. ';
      out += game.sans[i] + ' ';
    }
    return out.trim();
  }

  // ---------- Engine (negamax + alpha-beta + quiescence) ----------
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  var PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };

  function evaluate(pos) {
    // returns score from White's perspective
    var score = 0;
    for (var i = 0; i < 64; i++) {
      var p = pos.board[i];
      if (!p) continue;
      var pstIdx = p.c === 'w' ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8);
      var v = VAL[p.t] + PST[p.t][pstIdx];
      score += p.c === 'w' ? v : -v;
    }
    return score;
  }

  function orderMoves(pos, moves) {
    return moves.sort(function (a, b) {
      var sa = (a.captured ? 10 * VAL[a.captured] - VAL[a.piece] : 0) + (a.promotion ? VAL[a.promotion] : 0);
      var sb = (b.captured ? 10 * VAL[b.captured] - VAL[b.piece] : 0) + (b.promotion ? VAL[b.promotion] : 0);
      return sb - sa;
    });
  }

  var MATE = 100000;
  function search(pos, depth, alpha, beta, ply, nodes) {
    nodes.n++;
    if (depth === 0) return quiesce(pos, alpha, beta, ply, nodes);
    var moves = orderMoves(pos, legalMoves(pos));
    if (moves.length === 0) {
      return inCheck(pos, pos.turn) ? -MATE + ply : 0;
    }
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var score = -search(makeMove(pos, moves[i]), depth - 1, -beta, -alpha, ply + 1, nodes);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  function quiesce(pos, alpha, beta, ply, nodes) {
    nodes.n++;
    var stand = (pos.turn === 'w' ? 1 : -1) * evaluate(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply >= 6) return alpha;
    var moves = orderMoves(pos, legalMoves(pos).filter(function (m) { return m.flags && m.flags.capture; }));
    for (var i = 0; i < moves.length; i++) {
      var score = -quiesce(makeMove(pos, moves[i]), -beta, -alpha, ply + 1, nodes);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function findBestMoves(pos, depth) {
    var nodes = { n: 0 };
    var moves = orderMoves(pos, legalMoves(pos));
    var scored = [];
    var alpha = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var score = -search(makeMove(pos, moves[i]), depth - 1, -Infinity, -alpha, 1, nodes);
      scored.push({ move: moves[i], score: score, san: moveToSAN(pos, moves[i], moves) });
      if (score > alpha) alpha = score;
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    // score is from side-to-move perspective; convert best to white perspective
    var whiteScore = pos.turn === 'w' ? (scored[0] ? scored[0].score : 0) : (scored[0] ? -scored[0].score : 0);
    return { moves: scored.slice(0, 5), whiteScore: whiteScore, nodes: nodes.n, depth: depth };
  }

  // ---------- Opening book (small, common lines by SAN prefix) ----------
  var BOOK = [
    { line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', name: 'Ruy Lopez' },
    { line: 'e4 e5 Nf3 Nc6 Bc4 Bc5', name: 'Italian Game' },
    { line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', name: 'Sicilian Najdorf' },
    { line: 'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7', name: 'French Defense' },
    { line: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', name: 'Caro-Kann' },
    { line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O', name: 'Queen\'s Gambit Declined' },
    { line: 'd4 Nf6 c4 e6 Nf3 b6', name: 'Queen\'s Indian' },
    { line: 'd4 f5 c4 Nf6 Nc3 e6', name: 'Dutch Defense' },
    { line: 'e4 e5 f4', name: 'King\'s Gambit' },
    { line: 'c4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e6', name: 'Sicilian Open' },
    { line: 'Nf3 d5 d4 Nf6 c4 e6', name: 'Indian Game' },
    { line: 'e4 d5', name: 'Scandinavian Defense' },
    { line: 'e4 g6', name: 'Modern Defense' },
    { line: 'd4 d5 Bf4', name: 'London System' }
  ];
  function lookupOpening(sans) {
    var seq = sans.join(' ');
    var best = null;
    BOOK.forEach(function (b) {
      if (seq === b.line || b.line.indexOf(seq) === 0) {
        if (!best || b.line.length > best.line.length) best = b;
      }
    });
    return best;
  }

  var api = {
    START_FEN: START_FEN, parseFEN: parseFEN, toFEN: toFEN, clonePos: clonePos,
    legalMoves: legalMoves, makeMove: makeMove, moveToSAN: moveToSAN, sanToMove: sanToMove,
    inCheck: inCheck, Game: Game, parsePGN: parsePGN, toPGN: toPGN,
    evaluate: evaluate, findBestMoves: findBestMoves, lookupOpening: lookupOpening,
    sqName: sqName, sqIndex: sqIndex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChessCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
