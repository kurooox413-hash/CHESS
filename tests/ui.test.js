/* DOM smoke test: loads web/index.html in jsdom with app.js and chess-core.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script src="core/chess-core.js"></script>', '')
  .replace('<script src="app.js"></script>', '');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
const { window } = dom;

// a few browser APIs jsdom lacks
window.navigator.clipboard = { writeText: () => Promise.resolve() };
window.alert = (m) => { throw new Error('alert: ' + m); };
window.fetch = (url) => {
  if (String(url).includes('/games/archives')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ archives: ['https://api.chess.com/pub/player/foo/games/2024/01'] }) });
  }
  if (String(url).includes('api.chess.com')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ games: [{
      pgn: '[Event "Live"]\n[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
      white: { username: 'alice', result: 'win' }, black: { username: 'bob', result: 'checkmated' }
    }] }) });
  }
  return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
};

window.eval(fs.readFileSync(path.join(root, 'core', 'chess-core.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));

const $ = (id) => window.document.getElementById(id);
let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('PASS', n)) : (fail++, console.log('FAIL', n)); };
const click = (id) => $(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

ok(window.document.querySelectorAll('#board .sq').length === 64, 'board renders 64 squares');
ok(/White to move/.test($('status').textContent), 'initial status');

// make e4 by clicking e2 then e4
const sq = (name) => {
  const f = 'abcdefgh'.indexOf(name[0]), r = 8 - parseInt(name[1], 10);
  return window.document.querySelector('#board .sq[data-idx="' + (r * 8 + f) + '"]');
};
click('btnNew');
sq('e2').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(window.document.querySelectorAll('#board .sq.sel').length === 1, 'click selects a piece');
sq('e4').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok($('moves').textContent.includes('e4'), 'move e4 played and listed, got: ' + $('moves').textContent.trim());
ok(/Black to move/.test($('status').textContent), 'turn switched to black');

click('btnUndo');
ok(!$('moves').textContent.includes('e4'), 'undo removes the move');

// PGN load + navigation
$('pgnInput').value = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O';
click('btnPgn');
ok($('opening').textContent.includes('Ruy Lopez'), 'opening name shown, got: ' + $('opening').textContent);
click('btnStart');
ok(/White to move/.test($('status').textContent), 'rewind to start');
click('btnNext');
ok(/reviewing move 1/.test($('status').textContent), 'step forward one move, got: ' + $('status').textContent);
click('btnEnd');
ok(/Black to move/.test($('status').textContent), 'jump to end');

// analyze
click('btnAnalyze');
setTimeout(() => {
  ok($('topMoves').textContent.length > 5, 'analyze produced output');
  ok(!/Thinking/.test($('topMoves').textContent), 'analyze finished');

  // review game
  click('btnReview');
  setTimeout(() => {
    ok(/Review:/.test($('reviewInfo').textContent), 'game review completes: ' + $('reviewInfo').textContent.slice(0, 60));
    ok(window.document.querySelectorAll('#moves .mv').length === 9, 'move list has 9 plies');

    // coach without key
    $('chatInput').value = 'What is the plan?';
    click('btnSend');
    setTimeout(() => {
      ok(/Add an API key/.test($('chatLog').textContent), 'coach prompts for API key when absent');

      // chess.com import
      $('ccUser').value = 'foo';
      click('btnCcLoad');
      setTimeout(() => {
        ok(/Loaded alice vs bob/.test($('ccInfo').textContent), 'chess.com import: ' + $('ccInfo').textContent.slice(0, 80));
        ok(/Checkmate/.test($('status').textContent), 'imported game ends in checkmate');
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
      }, 300);
    }, 50);
  }, 2500);
}, 500);
