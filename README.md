# ♞ Chess Coach

A post-game chess analysis and study tool: a **web app** you can open from any browser, and a
**Chrome side-panel extension** you can install in one click. It has a built-in chess engine,
an optional AI coach that talks about the position, and one-click import of your finished
Chess.com games through Chess.com's official public API.

> **This is not a live-game assistant.** Chess.com prohibits engines, plugins, browser
> extensions, or any analysis during ongoing games, and it closes accounts for it — about
> 314,000 in the first quarter of 2025 alone. Everything here only works on **finished**
> games, puzzles, and study positions.

---

## What you get

| Feature | Details |
| --- | --- |
| Full rules engine | Castling, en passant, promotion, check/checkmate/stalemate, 50-move, threefold repetition, insufficient material. Verified against **perft to depth 4** on six standard test positions. |
| Real search | Negamax + alpha-beta, quiescence, principal-variation search, killer moves, transposition table, aspiration at the root, mate-distance scoring, time limits. ~20k nodes/sec, depth 4 in ~200 ms. |
| Evaluation | Material + piece-square tables + bishop pair, doubled/isolated/passed pawns, rooks on open files, king shield, tempo — **every weight is a setting**. |
| Game review | Streams through a whole game computing centipawn loss and win-probability accuracy per move, classifies blunders/mistakes/inaccuracies, charts the accuracy curve, and names the better move. |
| 156 settings | Board, engine, evaluation weights, review thresholds, coach, import, interface, accessibility, fair play, data. Searchable, tiered (basic/advanced/experimental), with 6 presets, export/import. Every one is wired — see below. |
| AI coach | Position-aware chat with engine eval, move history, opening name and your review marks in the prompt. OpenAI, Anthropic, Ollama, LM Studio or any compatible endpoint. |
| Chess.com import | Browse your last three months of finished games with filters, then load one or auto-review it. |
| Fair-play guard | Locks analysis while a live board is open, in the extension. |

Everything runs locally except two optional network calls: the Chess.com import and your own
LLM request.

### Settings that actually do something

Nothing in the settings panel is decorative. A few examples:

| Setting | What it changes in the code |
| --- | --- |
| `engineDepth`, `engineTimeMs`, `engineMultipv` | Search depth, wall-clock cap, number of reported lines |
| `wMatPawn` … `wTempo` | Feeds `evaluate()` directly — change knight value and the engine plays differently |
| `engineRandomness`, `engineBlunderChance` | Adds eval jitter and occasional worse-move choice at the root |
| `blunderCp`, `mistakeCp`, `inaccuracyCp` | Review classification thresholds |
| `reviewDepth`, `reviewTimePerMove` | Per-move search budget for the review |
| `boardTheme`, `pieceSize`, `borderRadius`, `fontScale` | CSS custom properties on `:root` |
| `showBestArrow`, `arrowStyle`, `arrowOpacity` | Arrow geometry in the SVG overlay |
| `engineMultipv` | Truncates the rendered engine line list |
| `fairPlayGuard`, `warnOnLiveTab` | Enables the live-game lockout |
| `sessionOnlyKey` | Keeps the API key out of persistent storage |
| `importMaxGames`, `importTimeClass`, `importRatedOnly` | Filters applied to the Chess.com archive query |
| `persona`, `verbosity`, `language`, `contextMoves` | Composed into the system prompt and the per-question context |

Tier "experimental" settings are grouped last and labelled, because they're either
untested at scale or genuinely questionable (e.g. `engineNullMove`, which is not
implemented and would silently do nothing — read the table in `ROADMAP.md` for the
honest list of soft spots).

---

## Quick start — web app (no install)

The app is plain static files, so any static server works:

```bash
cd web
python3 -m http.server 8080
# open http://localhost:8080
```

It also works from `file://`, though the Chess.com import may be blocked by the browser's CORS
rules there — use the local server or the extension for imports.

## Quick start — Chrome extension

1. Download / unpack `chess-coach-extension.zip` (or use this repo's `extension/` folder).
2. Go to `chrome://extensions` → turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder that contains `manifest.json`
   (the `extension/` directory). Don't point at the `.zip` itself.
4. Click the ♞ toolbar icon — the coach opens in Chrome's side panel next to the page.
5. Import a game: type your Chess.com username → **Load**.

Requires Chrome 114+ (Side Panel API). No build step, no dependencies, no remote code.

### Why the extension can't be "loaded from a link"

Chrome only installs extensions from the Chrome Web Store, or from a folder/`.crx` through
`chrome://extensions` with Developer mode on. That's a browser rule, not a limitation of this
project. If you publish it to the Web Store you get a real one-click install link; until then,
the zip + "Load unpacked" flow above is the way.

---

## Fair play — the rules this project follows

Straight from Chess.com's Fair Play Policy:

- No engines, software, bots, plugins, **browser extensions**, or analysis tools
  **during play**.
- In Live chess, **no outside assistance of any kind** — including your own prepared notes.
- No automated analysis or "blunder checking" of games **in progress**.
- Daily chess allows books, videos, and non-engine opening databases — still no engines or
  tablebases.
- Analysis of **finished** games is unrestricted. It's the same thing Chess.com's own Game
  Review does.

So this app deliberately has no live mode. Specifically, it does **not**:

- read the board on chess.com, or inject an overlay,
- fetch or watch an in-progress game,
- hide itself, imitate a human, throttle engine strength to dodge detection, or otherwise
  attempt to evade fair-play systems.

If you open a live game tab, the extension shows a red banner and disables Analyze, Review and
the AI coach until it's closed. That guard is a feature, not a bug.

False accusations are also against the rules — report suspected cheaters to Chess.com instead
of accusing anyone publicly.

---

## Chess.com import details

Uses only documented endpoints under `https://api.chess.com/pub`:

```
GET /pub/player/{username}                    profile (status shows fair-play closures)
GET /pub/player/{username}/stats              ratings per time class
GET /pub/player/{username}/games/archives     monthly archive URLs, ascending
GET /pub/player/{username}/games/{YYYY}/{MM}  finished games: pgn, fen, results, accuracies
```

Public, read-only, no key, and it cannot send moves. Serial use is unlimited; parallel bursts
may return `429`, so requests are made one at a time. Data can lag up to ~12–24 h. The ongoing
game endpoint (`/games/to-move`) is intentionally not used.

---

## AI coach settings

Open **⚙️ Coach settings**:

| Field | Notes |
| --- | --- |
| Provider | OpenAI, Anthropic, or *Custom* (any OpenAI-compatible `/chat/completions`) |
| Model | e.g. `gpt-4o-mini`, `gpt-4.1-mini`, `claude-sonnet-4-5`, or your local model's name |
| API key | Stored in `localStorage` (web) / `chrome.storage.local` (extension). Never sent anywhere except your chosen provider. |
| Base URL | Custom provider only, e.g. `http://localhost:11434/v1` for Ollama |
| Temperature | 0–2 |
| System prompt | Defaults to a concise coaching style |

Every question is sent with the FEN, the moves played, whose turn it is, and the built-in
engine's depth-2 eval + top moves, so the model talks about the actual position rather than
guessing.

**Anthropic from a browser:** direct browser calls need the
`anthropic-dangerous-direct-browser-access: true` header, which this app sends. If your
provider blocks browser origins, use the Custom option with a small proxy, or use OpenAI.

---

## Layout

```
web/                      standalone app
  index.html              tabbed shell: Play / Review / Coach / Games / Settings
  styles.css              themes, density, a11y hooks via CSS custom properties
  app.js                  all UI behaviour (shared with the extension)
  settings-schema.js      156 settings as data — the settings UI is generated
  core/chess-core.js      rules, FEN/SAN/PGN, search, evaluation, review
extension/                Chrome MV3 side panel
  manifest.json           minimal permissions, sidePanel
  background.js           service worker, opens the panel on icon click
  guard.js                fair-play guard (URL-path check only, no data reads)
  index.html              panel shell (same app, narrower layout)
  app.js, styles.css, settings-schema.js, core/   copies of web/
  icons/
tests/
  chess-core.test.js      80 assertions: perft, rules, PGN, search, review, schema
  ui.test.js              50 assertions: clicks, nav, analysis, review, import, settings
  extension.test.js       11 assertions: panel boots, manifest stays minimal, guard stays dumb
chess-coach-extension.zip  ready-to-load extension build (48 KB)
RESEARCH.md               sources + reasoning behind the design
ROADMAP.md                ranked list of what to build next, with effort estimates
```

`web/` and `extension/` share `app.js`, `styles.css`, `settings-schema.js` and
`core/chess-core.js`. After editing one, copy across:

```bash
cp web/app.js web/styles.css web/settings-schema.js extension/
cp web/core/chess-core.js extension/core/
```

then rebuild the zip:

```bash
cd extension && zip -r ../chess-coach-extension.zip . -x '.*' && cd ..
```

## Tests

```bash
node tests/chess-core.test.js    # perft, rules, PGN, search, review, settings schema
npm install jsdom
node tests/ui.test.js            # board, nav, analysis, review, import, live lockout
node tests/extension.test.js     # panel boots, manifest minimal, guard reads no data
```

All green: **80 + 50 + 11 = 141 assertions**. The perft suite matches the published
node counts for startpos (197,281), Kiwipete (97,862), and the four other standard
positions — that's what caught a castling bug where the king landed on f1 instead of g1.

## Limits worth knowing

Written down on purpose — see `ROADMAP.md` for the full table.

- The engine is a readable, dependency-free implementation, not Stockfish. It finds tactics
  and big swings at depth 4; it will not out-analyse a 3000-rated engine. Bundling
  Stockfish WASM is the top item on the roadmap.
- Review accuracy uses our own win-probability formula (Lichess-style sigmoid), not a model
  calibrated on a large corpus. Treat percentages as relative, not absolute.
- Chess.com PGNs with variants (Chess960, Crazyhouse) won't replay — standard chess only.
- Opening book is 50 hand-written lines with ECO tags, not a full ECO database.
- Some "experimental" settings are placeholders for work not done yet (null-move pruning,
  late-move reductions). They're labelled rather than hidden so you can see the roadmap in
  the UI.

## License

MIT for this code. Chess.com's data, branding, piece art and move-classification glyphs are
theirs; this project uses none of them.
