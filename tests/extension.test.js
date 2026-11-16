/* Extension panel smoke test: the side panel must boot with the same app. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', 'extension');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://test/index.html', pretendToBeVisual: true });
const { window } = dom;
window.confirm = () => true;
window.fetch = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
window.eval(fs.readFileSync(path.join(root, 'core', 'chess-core.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'settings-schema.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { c ? (pass++, console.log('PASS', n)) : (fail++, console.log('FAIL', n, extra || '')); };
const $ = (id) => window.document.getElementById(id);

ok(window.document.querySelectorAll('#board .sq').length === 64, 'panel renders the board');
ok(!!window.ChessCoach, 'panel exposes the app API');
ok(window.ChessCoach.settingsSchema.count > 140, 'panel ships the full settings schema');
window.ChessCoach.switchTab('settings');
ok(window.document.querySelectorAll('#settingsBody .setRow').length > 40, 'panel renders settings');

// the manifest must stay minimal
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
ok(manifest.manifest_version === 3, 'manifest v3');
ok(JSON.stringify(manifest.permissions.sort()) === JSON.stringify(['sidePanel', 'storage']), 'only storage + sidePanel permissions');
ok(!manifest.host_permissions.includes('<all_urls>'), 'no all_urls host permission');
ok(JSON.stringify(manifest.content_scripts[0].matches) === JSON.stringify(['*://*.chess.com/*']), 'content script limited to chess.com');

// the guard must not read board data
const guard = fs.readFileSync(path.join(root, 'guard.js'), 'utf8');
ok(!/querySelector\([^)]*(\.piece|board-|wc-chess-board\[)/.test(guard.replace(/wc-chess-board, chess-board/g, '')),
  'guard does not query piece elements');
ok(!/fetch\(|XMLHttpRequest|api\.chess\.com/.test(guard), 'guard performs no network calls');
ok(/location\.pathname/.test(guard), 'guard decides from the URL path only');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
