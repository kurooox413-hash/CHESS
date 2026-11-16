/* DOM tests: node tests/ui.test.js  (npm install jsdom) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<script src="core/chess-core.js"></script>', '')
  .replace('<script src="settings-schema.js"></script>', '')
  .replace('<script src="app.js"></script>', '');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/', pretendToBeVisual: true });
const { window } = dom;

window.navigator.clipboard = { writeText: () => Promise.resolve() };
window.confirm = () => true;
window.alert = (m) => { throw new Error('alert: ' + m); };
window.fetch = (url) => {
  if (String(url).includes('/games/archives')) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ archives: ['https://api.chess.com/pub/player/foo/games/2024/01'] }) });
  }
  if (String(url).includes('api.chess.com')) {
    return Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({
        games: [{
          pgn: '[Event "Live"]\n[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
          white: { username: 'alice', rating: 1500, result: 'win' },
          black: { username: 'bob', rating: 1480, result: 'checkmated' },
          time_class: 'blitz', time_control: '300', rated: true,
          accuracies: { white: 88.1, black: 71.4 }
        }]
      })
    });
  }
  return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
};

window.eval(fs.readFileSync(path.join(root, 'core', 'chess-core.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'settings-schema.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));

const $ = (id) => window.document.getElementById(id);
let pass = 0, fail = 0;
const ok = (c, n, extra) => {
  if (c) { pass++; console.log('PASS', n); }
  else { fail++; console.log('FAIL', n, extra == null ? '' : '→ ' + extra); }
};
const click = (id) => $(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const sqEl = (name) => {
  const f = 'abcdefgh'.indexOf(name[0]), r = 8 - parseInt(name[1], 10);
  return window.document.querySelector('#board .sq[data-idx="' + (r * 8 + f) + '"]');
};
const clickSq = (name) => sqEl(name).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const coach = window.ChessCoach;

(async function run() {
  // ------------------------------------------------------------- board
  ok(window.document.querySelectorAll('#board .sq').length === 64, 'board renders 64 squares');
  ok(/White to move/.test($('status').textContent), 'initial status');
  ok($('evalLine').textContent === '', 'eval line starts empty');

  clickSq('e2');
  ok(window.document.querySelectorAll('#board .sq.sel').length === 1, 'click selects a piece');
  ok(window.document.querySelectorAll('#board .dot').length > 0, 'legal move dots render');
  clickSq('e4');
  ok($('moves').textContent.includes('e4'), 'move plays and appears in the list');
  ok(/Black to move/.test($('status').textContent), 'turn passes to black');
  ok(coach.getGame().fen().startsWith('rnbqkbnr/pppppppp/8/8/4P3'), 'board state advanced');

  click('btnUndo');
  ok(!$('moves').textContent.includes('e4'), 'undo works');

  click('btnFlip');
  const firstSq = window.document.querySelector('#board .sq');
  ok(firstSq.dataset.idx === '63', 'flip reverses the board', firstSq.dataset.idx);
  click('btnFlip');

  // ------------------------------------------------------------- PGN + nav
  $('pgnInput').value = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
  click('btnPgn');
  await wait(30);
  ok(/Ruy Lopez/.test($('opening').textContent), 'opening name shown', $('opening').textContent);
  ok(/ECO/.test($('opening').textContent), 'ECO code shown', $('opening').textContent);
  ok(window.document.querySelectorAll('#moves .mv').length === 10, 'move list has 10 plies',
    window.document.querySelectorAll('#moves .mv').length);

  click('btnStart');
  ok(/viewing 0|White to move/.test($('status').textContent), 'rewind to start', $('status').textContent);
  click('btnNext');
  ok(/viewing 1\/10/.test($('status').textContent), 'step forward', $('status').textContent);
  click('btnEnd');
  ok(/White to move/.test($('status').textContent), 'jump to end', $('status').textContent);

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  ok(/viewing 9\/10/.test($('status').textContent), 'arrow-key navigation', $('status').textContent);

  // ------------------------------------------------------------- analysis
  click('btnAnalyze');
  await wait(500);
  ok($('topMoves').querySelectorAll('.line').length >= 3, 'engine lines rendered',
    $('topMoves').querySelectorAll('.line').length);
  ok(/nodes/.test($('evalLine').textContent), 'diagnostics line rendered', $('evalLine').textContent);
  ok(window.document.querySelectorAll('#arrows line').length >= 1, 'best-move arrow drawn');
  ok($('evalFill').style.height && $('evalFill').style.height !== '50%', 'eval bar updated', $('evalFill').style.height);

  // ------------------------------------------------------------- review
  click('btnReview');
  await wait(1800);
  ok(/White/.test($('reviewInfo').textContent) && /Black/.test($('reviewInfo').textContent),
    'review summary renders', $('reviewInfo').textContent.slice(0, 80));
  ok(window.document.querySelectorAll('#accuracyBars .accRow').length === 2, 'per-side accuracy bars');
  ok($('accuracyGraph').querySelector('polyline'), 'accuracy graph drawn');
  ok(/%/.test($('reviewInfo').textContent), 'accuracy percentages present');

  // ------------------------------------------------------------- tabs
  coach.switchTab('review');
  ok(window.document.querySelector('.panel[data-panel="review"]').classList.contains('active'), 'tab switch works');
  coach.switchTab('play');

  // ------------------------------------------------------------- coach
  $('chatInput').value = 'What is the plan?';
  click('btnSend');
  await wait(80);
  ok(/API key/.test($('chatLog').textContent), 'coach asks for a key when absent', $('chatLog').textContent.slice(0, 60));
  ok(/key set|no key/.test($('coachMeta').textContent), 'coach meta shows key state', $('coachMeta').textContent);

  // ------------------------------------------------------------- chess.com import
  $('ccUser').value = 'foo';
  click('btnCcLoad');
  await wait(200);
  ok(window.document.querySelectorAll('#gameList .gameItem').length === 1, 'imported game listed',
    $('ccInfo').textContent);
  window.document.querySelector('#gameList .gameItem').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(80);
  ok(/Checkmate/.test($('status').textContent), 'imported game loads to checkmate', $('status').textContent);

  // ------------------------------------------------------------- settings UI
  coach.switchTab('settings');
  await wait(30);
  const coreRows = window.document.querySelectorAll('#settingsBody .setRow').length;
  ok(coreRows > 40, 'settings render a large surface', coreRows);
  ok(/shown ·/.test($('settingsCount').textContent), 'settings counter shown', $('settingsCount').textContent);

  $('settingsSearch').value = 'theme';
  $('settingsSearch').dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(20);
  const themeRows = window.document.querySelectorAll('#settingsBody .setRow').length;
  ok(themeRows > 0 && themeRows < coreRows, 'settings search filters', themeRows + ' of ' + coreRows);

  $('settingsSearch').value = '';
  $('settingsSearch').dispatchEvent(new window.Event('input', { bubbles: true }));
  const tier = $('tierSel');
  tier.value = 'lab';
  tier.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const labRows = window.document.querySelectorAll('#settingsBody .setRow').length;
  ok(labRows > coreRows, 'experimental tier reveals more settings', labRows + ' vs ' + coreRows);
  tier.value = 'core';
  tier.dispatchEvent(new window.Event('change', { bubbles: true }));

  // a live setting actually changes the DOM
  coach.setSetting('boardTheme', 'green');
  await wait(20);
  const light = window.document.documentElement.style.getPropertyValue('--sq-light');
  ok(/#eeeed2/i.test(light), 'board theme setting changes CSS variable', light);

  coach.setSetting('appTheme', 'light');
  ok(window.document.body.dataset.theme === 'light', 'app theme applied to body',
    window.document.body.dataset.theme);

  coach.setSetting('engineMultipv', 2);
  coach.switchTab('play');
  $('fenInput').value = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  click('btnFen');
  await wait(30);
  click('btnAnalyze');
  await wait(400);
  ok($('topMoves').querySelectorAll('.line').length === 2, 'multipv setting limits lines',
    $('topMoves').querySelectorAll('.line').length);

  coach.setSetting('showBestArrow', false);
  ok(window.document.querySelectorAll('#arrows line').length === 0, 'arrow toggle hides the arrow');
  coach.setSetting('showBestArrow', true);

  // presets
  coach.switchTab('settings');
  const preset = $('presetSel');
  preset.value = 'accessible';
  preset.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(30);
  ok(coach.getSettings().highContrast === true, 'preset applies', coach.getSettings().highContrast);
  ok(window.document.body.dataset.contrast === 'high', 'preset affect reaches the DOM');

  // ------------------------------------------------------------- fair play lock
  coach.applyLiveState(true);
  ok($('liveNotice').hidden === false, 'live notice appears');
  ok($('btnAnalyze').disabled === true, 'analyze disabled during a live game');
  ok($('btnReview').disabled === true, 'review disabled during a live game');
  ok($('btnSend').disabled === true, 'coach disabled during a live game');
  ok(/locked/.test($('modePill').textContent), 'status pill shows locked state', $('modePill').textContent);
  coach.applyLiveState(false);
  ok($('btnAnalyze').disabled === false, 'analysis re-enabled when the live game closes');
  ok($('liveNotice').hidden === true, 'live notice hides again');

  // ------------------------------------------------------------- saved games
  coach.switchTab('library');
  $('pgnInput').value = '1. e4 e5 2. Nf3 Nc6 3. Bb5';
  click('btnPgn');
  await wait(30);
  click('btnSaveCurrent');
  await wait(20);
  ok(/Game · 5 moves/.test($('savedList').textContent), 'saving the current game works',
    $('savedList').textContent.slice(0, 60));

  // ------------------------------------------------------------- session persistence
  ok(!!window.localStorage.getItem('chesscoach.session.v1'), 'session is persisted');
  ok(!!window.localStorage.getItem('chesscoach.settings.v2'), 'settings are persisted');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('UI TEST CRASH', e);
  process.exit(1);
});
