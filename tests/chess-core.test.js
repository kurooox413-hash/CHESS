/* Core tests: node tests/chess-core.test.js */
const C = require('../web/core/chess-core.js');
const S = require('../web/settings-schema.js');
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra == null ? '' : '→ ' + extra); }
}

// ---------------------------------------------------------------- rules
let g = new C.Game();
ok(g.legalMoves().length === 20, 'startpos: 20 legal moves');
ok(g.fen() === C.START_FEN, 'startpos FEN round-trips');

const PERFT = [
  ['startpos', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['endgame', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['promotions', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['mate-threats', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['midgame', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]]
];
let perftOk = true;
PERFT.forEach(function (row) {
  const pos = C.parseFEN(row[1]);
  row[2].forEach(function (want, d) {
    const got = C.perft(pos, d + 1);
    if (got !== want) perftOk = false;
    ok(got === want, 'perft ' + row[0] + ' d' + (d + 1) + ' = ' + want, got);
  });
});

// castling correctness (the v1 bug: king landed on f1)
g = new C.Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
g.moveSAN('O-O');
ok(g.fen().split(' ')[0] === 'r3k2r/8/8/8/8/8/8/R4RK1', 'kingside castle: Kg1 + Rf1', g.fen());
g = new C.Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
g.moveSAN('O-O-O');
ok(g.fen().split(' ')[0] === 'r3k2r/8/8/8/8/8/8/2KR3R', 'queenside castle: Kc1 + Rd1', g.fen());

// special moves
g = new C.Game();
['e4', 'a6', 'e5', 'd5'].forEach(s => g.moveSAN(s));
ok(g.legalMoves().some(m => m.flags && m.flags.ep), 'en passant offered');
g.moveSAN('exd6');
ok(g.sans[g.sans.length - 1] === 'exd6', 'en passant SAN');

g = new C.Game('8/P7/8/8/8/8/k6K/8 w - - 0 1');
ok(g.legalMoves().filter(m => m.promotion).length === 4, '4 promotion options');
g.moveSAN('a8=Q');
ok(g.fen().startsWith('Q7'), 'promotion applied');

// terminal states
g = new C.Game();
['f3', 'e5', 'g4', 'Qh4#'].forEach(s => g.moveSAN(s));
ok(g.status() === 'checkmate' && g.winner() === 'b', "fool's mate");
ok(new C.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status() === 'stalemate', 'stalemate');
ok(new C.Game('8/8/8/8/8/8/8/K6k w - - 0 1').status() === 'material', 'K vs K insufficient');
ok(new C.Game('8/8/8/8/8/8/8/KB5k w - - 0 1').status() === 'material', 'KB vs K insufficient');
ok(new C.Game('8/8/8/8/8/8/8/KR5k w - - 0 1').status() === 'playing', 'KR vs K is playable');

// repetition draw
g = new C.Game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
['Ra2', 'Ke7', 'Ra1', 'Ke8', 'Ra2', 'Ke7', 'Ra1', 'Ke8'].forEach(s => g.moveSAN(s));
ok(g.status() === 'repetition', 'threefold repetition detected', g.status());

// fifty-move rule
g = new C.Game('4k3/8/8/8/8/8/8/R3K3 w - - 99 1');
g.moveSAN('Ra2');
ok(g.status() === 'fifty', 'fifty-move rule detected', g.status());

// ---------------------------------------------------------------- PGN
g = new C.Game();
['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'].forEach(s => g.moveSAN(s));
let pgn = C.toPGN(g, { White: 'A', Black: 'B', Result: '*' });
let parsed = C.parsePGN(pgn);
ok(parsed.sans.length === 9, 'PGN round-trip move count', parsed.sans.length);
ok(parsed.game.fen() === g.fen(), 'PGN round-trip FEN');

// PGN with comments, NAGs, variations and clocks
const messy = `[Event "Test"]
[White "X"]
[Black "Y"]

1. e4 {best by test} e5 2. Nf3 $1 (2. Bc4 Nf6) Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1/2-1/2`;
parsed = C.parsePGN(messy);
ok(parsed.sans.length === 10, 'PGN ignores comments/NAGs/variations', parsed.sans.length);
ok(parsed.headers.White === 'X', 'PGN headers parsed');

// PGN starting from a FEN (study position)
const fromFen = '[FEN "8/P7/8/8/8/8/k6K/8 w - - 0 1"]\n[Result "*"]\n\n1. a8=Q+ *';
parsed = C.parsePGN(fromFen);
ok(parsed.sans[0] === 'a8=Q+', 'PGN from FEN', parsed.sans[0]);

// malformed PGN should not throw
let threw = false;
try { C.parsePGN('1. e4 zzzz 2. Qh5'); } catch (e) { threw = true; }
ok(!threw, 'malformed PGN does not throw');

// ---------------------------------------------------------------- search
let r = C.analyse(new C.Game('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1').pos, { depth: 2 });
ok(r.moves[0] && r.moves[0].san.startsWith('Ra8'), 'finds mate in 1', r.moves[0] && r.moves[0].san);

r = C.analyse(new C.Game('r5rk/5p1p/5R2/4B3/8/8/7P/7K w - - 0 1').pos, { depth: 3 });
ok(r.moves[0] && /Rxf7|Ra6/.test(r.moves[0].san), 'finds a mating try in 3', r.moves[0] && r.moves[0].san);

const mateScore = C.analyse(new C.Game('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1').pos, { depth: 3 });
ok(Math.abs(mateScore.moves[0].score) > C.MATE - 1000, 'mate is scored as mate');

r = C.analyse(new C.Game().pos, { depth: 3 });
ok(r.moves.length === 5, 'multipv default returns 5 lines');
ok(r.moves.every((m, i, a) => i === 0 || a[i - 1].score >= m.score), 'lines sorted by score');
ok(Math.abs(r.whiteScore) < 120, 'startpos eval is near equal', r.whiteScore);
ok(r.nodes > 100, 'node counter increments', r.nodes);

// a hanging queen must be taken
r = C.analyse(C.parseFEN('rnb1kbnr/pppppppp/8/8/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1'), { depth: 2 });
ok(r.moves[0].san === 'Nxd4', 'captures a hanging queen', r.moves[0].san);

// an available mate must be played
r = C.analyse(C.parseFEN('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4'), { depth: 2 });
ok(r.moves[0].san === 'Qxf7#', 'plays scholar\'s mate', r.moves[0].san);

// weights change the evaluation
const start = C.parseFEN(C.START_FEN);
const plain = C.evaluate(start);
const greedy = C.evaluate(start, Object.assign({}, C.DEFAULT_WEIGHTS, { tempo: 50, kingShield: 40 }));
ok(greedy !== plain, 'evaluation weights are applied', plain + ' vs ' + greedy);

// piece values are configurable
const knightHeavy = C.evaluate(start, C.DEFAULT_WEIGHTS, { p: 100, n: 900, b: 330, r: 500, q: 900, k: 20000 });
ok(knightHeavy === plain, 'symmetric startpos is 0 under any values', knightHeavy);

// time limit is honoured
const t0 = Date.now();
C.analyse(C.parseFEN('r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10'), { depth: 8, timeMs: 250 });
ok(Date.now() - t0 < 4000, 'time limit prevents runaway search', (Date.now() - t0) + 'ms');

// ---------------------------------------------------------------- review
let game = new C.Game();
['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'].forEach(s => game.moveSAN(s));
let rev = C.reviewGame(C.START_FEN, game.sans, { depth: 2 });
ok(rev.rows.length === 7, 'review covers every move', rev.rows.length);
ok(rev.rows.every(row => row.accuracy >= 0 && row.accuracy <= 100), 'accuracy in range');
ok(rev.rows.every(row => row.best), 'every row names a better move candidate');
ok(rev.white.accuracy > 0 && rev.black.accuracy > 0, 'both sides summarised');
ok(rev.rows[rev.rows.length - 1].classification === 'best', 'mate is classified best');
ok(C.winProbability(0) === 50, 'win probability centred at 0');
ok(C.winProbability(900) > 95, 'win probability saturates for a big plus');
ok(C.winProbability(-900) < 5, 'win probability saturates for a big minus');

// classification thresholds are configurable
rev = C.reviewGame(C.START_FEN, game.sans, { depth: 2, blunderCp: 20, mistakeCp: 10, inaccuracyCp: 5 });
ok(rev.rows.some(row => row.classification === 'blunder' || row.classification === 'mistake'),
  'lower thresholds flag more moves');

// ---------------------------------------------------------------- openings
g = new C.Game();
['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'].forEach(s => g.moveSAN(s));
let op = C.lookupOpening(g.sans);
ok(op && /Ruy Lopez/.test(op.name), 'opening: Ruy Lopez', op && op.name);
ok(op && op.eco === 'C65', 'opening carries an ECO code', op && op.eco);
ok(C.lookupOpening(['e4', 'c5']) && /Sicilian/.test(C.lookupOpening(['e4', 'c5']).name), 'opening: Sicilian');
ok(C.lookupOpening(['h4', 'h5', 'g4']) === null, 'unknown opening returns null');

// ---------------------------------------------------------------- undo / history
g = new C.Game();
g.moveSAN('e4'); g.moveSAN('e5'); g.undo();
ok(g.sans.length === 1 && g.pos.turn === 'b', 'undo restores turn and move list');
ok(g.history.length === 1, 'undo pops history');

// ---------------------------------------------------------------- settings schema
ok(S.count > 140, 'settings schema has a large surface', S.count);
ok(Object.keys(S.defaults()).length === S.count, 'every setting has a default');
const ids = Object.keys(S.byId);
ok(ids.length === new Set(ids).size, 'setting ids are unique');
ok(S.sections.every(s => s.fields.every(f => f.tier === 'core' || f.tier === 'advanced' || f.tier === 'lab')),
  'every setting declares a tier');
ok(S.sections.every(s => s.fields.every(f => f.group && f.label)), 'every setting has group + label');

const norm = S.normalise({ engineDepth: 99, boardTheme: 'nope', coordinates: 'yes', bogusKey: 1 });
ok(norm.engineDepth === 8, 'range settings are clamped', norm.engineDepth);
ok(norm.boardTheme === 'brown', 'invalid select falls back to default', norm.boardTheme);
ok(norm.coordinates === true, 'toggle coerces truthy strings', norm.coordinates);
ok(!('bogusKey' in norm), 'unknown stored keys are dropped');

ok(Object.keys(S.presets).every(function (p) {
  return Object.keys(S.presets[p]).every(k => S.byId[k]);
}), 'every preset references real settings');

ok(S.engineWeights(S.defaults()).passedPawn.length === 8, 'passed-pawn curve derived from one setting');
ok(S.pieceValues(S.defaults()).q === 900, 'piece values derived from settings');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
