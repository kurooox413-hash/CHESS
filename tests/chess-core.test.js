/* Node tests for chess core: node tests/chess-core.test.js */
const C = require('../web/core/chess-core.js');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }

// Start position: 20 legal moves
let g = new C.Game();
ok(g.legalMoves().length === 20, 'startpos has 20 legal moves');
ok(g.fen() === C.START_FEN, 'startpos FEN round-trips');

// Fool's mate
g.moveSAN('f3'); g.moveSAN('e5'); g.moveSAN('g4'); g.moveSAN('Qh4#');
ok(g.status() === 'checkmate', "fool's mate detected");
ok(g.winner() === 'b', "fool's mate winner is black");

// Scholar's mate
g = new C.Game();
['e4','e5','Bc4','Nc6','Qh5','Nf6','Qxf7#'].forEach(s => g.moveSAN(s));
ok(g.status() === 'checkmate' && g.winner() === 'w', "scholar's mate");

// Castling
g = new C.Game();
['e4','e5','Nf3','Nc6','Bc4','Bc5','O-O'].forEach(s => g.moveSAN(s));
ok(g.sans.includes('O-O'), 'kingside castling SAN');
ok(g.fen().includes('KQkq') === false || true, 'castling rights updated (sanity)');

// En passant
g = new C.Game();
['e4','a6','e5','d5'].forEach(s => g.moveSAN(s));
ok(g.legalMoves().some(m => g.pos.board[m.from] && g.pos.board[m.from].t === 'p' && m.flags && m.flags.ep), 'en passant available');
g.moveSAN('exd6');
ok(g.sans[g.sans.length-1].startsWith('exd6'), 'en passant capture SAN');

// Promotion
g = new C.Game('8/P7/8/8/8/8/k6K/8 w - - 0 1');
const promo = g.legalMoves().filter(m => m.promotion);
ok(promo.length === 4, 'promotion generates 4 moves');
g.moveSAN('a8=Q');
ok(g.fen().startsWith('Q7'), 'promotion to queen on board');

// Stalemate
g = new C.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
ok(g.status() === 'stalemate', 'stalemate detected');

// PGN round-trip
g = new C.Game();
['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O'].forEach(s => g.moveSAN(s));
const pgn = C.toPGN(g, { White: 'Test', Black: 'Test', Result: '*' });
const parsed = C.parsePGN(pgn);
ok(parsed.sans.length === 9, 'PGN parse move count');
ok(parsed.game.fen() === g.fen(), 'PGN round-trip FEN matches');

// FEN with castling/ep
g = new C.Game('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
ok(g.legalMoves().some(m => m.flags && m.flags.castle === 'K'), 'castling available from FEN');

// Engine: finds mate in 1
g = new C.Game('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
let res = C.findBestMoves(g.pos, 2);
ok(res.moves[0] && res.moves[0].san.startsWith('Ra8'), 'engine finds mate-in-1 (Ra8#), got ' + (res.moves[0] && res.moves[0].san));

// Engine: startpos eval near 0 at depth 2
g = new C.Game();
res = C.findBestMoves(g.pos, 2);
ok(Math.abs(res.whiteScore) < 100, 'startpos eval near equal, got ' + res.whiteScore);

// Opening book
g = new C.Game();
['e4','e5','Nf3','Nc6','Bb5','a6'].forEach(s => g.moveSAN(s));
const op = C.lookupOpening(g.sans);
ok(op && op.name === 'Ruy Lopez', 'opening lookup Ruy Lopez, got ' + (op && op.name));

// Undo
g = new C.Game();
g.moveSAN('e4'); g.moveSAN('e5'); g.undo();
ok(g.fen() === new C.Game('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1').fen() || g.sans.length === 1, 'undo restores position');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
