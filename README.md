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
| Full rules engine | Legal moves, castling, en passant, promotion, check/checkmate/stalemate, 50-move and insufficient-material draws, SAN + PGN import/export, FEN |
| Built-in analysis | Negamax engine with alpha-beta, quiescence search and move ordering. Depth 1–4, eval bar, top-5 moves with scores, best-move arrow. No API key, no network. |
| Game review | Steps through a whole game and flags **blunders / mistakes / inaccuracies** by centipawn loss, with the move that was better |
| Board workflow | Click to move, legal-move dots, last-move and check highlights, flip, undo, move list with clickable plies, ← → ↑ ↓ keyboard navigation |
| Chess.com import | Username → latest finished game loaded from the official public API (read-only, no key) |
| AI coach | Chat about the current position. OpenAI, Anthropic, or any OpenAI-compatible endpoint; your key stays in your browser. Model, temperature, base URL and system prompt are all editable. |
| Fair-play guard | Extension notices when a live board is open and disables analysis |

Everything runs locally except two optional network calls: the Chess.com import and your own
LLM request.

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
web/                 standalone app
  index.html
  styles.css
  app.js             UI + review + coach + import (shared with the extension)
  core/chess-core.js rules, FEN/PGN, engine, opening book
extension/           Chrome MV3 side panel
  manifest.json
  background.js      service worker, opens the panel on icon click
  guard.js           fair-play guard on chess.com (path check only, reads no board data)
  index.html         panel UI
  panel-extra.js     live-game notice + button lockout
  app.js, styles.css, core/  (copies of web/)
  icons/
tests/
  chess-core.test.js 19 engine/rules tests (node)
  ui.test.js         17 DOM tests (node + jsdom)
chess-coach-extension.zip   ready-to-load extension build
RESEARCH.md          sources + reasoning behind the design
```

`web/` and `extension/` share the same `app.js`, `styles.css` and `core/chess-core.js`. After
editing one, copy to the other:

```bash
cp web/app.js web/styles.css web/core/chess-core.js extension/ 2>/dev/null
cp web/core/chess-core.js extension/core/
```

then rebuild the zip:

```bash
cd extension && zip -r ../chess-coach-extension.zip . -x '.*' && cd ..
```

## Tests

```bash
node tests/chess-core.test.js   # rules, PGN, engine, opening book
npm install jsdom
node tests/ui.test.js           # board clicks, navigation, review, import, coach
```

Both suites pass: 19/19 and 17/17.

## Limits worth knowing

- The bundled engine is a readable, dependency-free implementation — strong enough to find
  tactics and big swings, not a Stockfish replacement. For serious analysis, run Stockfish
  locally and paste the PGN / compare lines.
- Review depth is 2 plies per position, so labels are a heuristic (150+ cp = blunder,
  70+ = mistake, 30+ = inaccuracy), not a verdict on your chess.
- Chess.com PGNs with variants (Chess960, Crazyhouse, etc.) won't replay correctly — the core
  supports standard chess only.
- Opening book is a small hand-written list of common lines, not an ECO database.

## License

MIT for this code. Chess.com's data, branding, piece art and move-classification glyphs are
theirs; this project uses none of them.
