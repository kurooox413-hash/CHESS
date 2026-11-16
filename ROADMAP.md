# Making this world-class — a ranked build order

Status: **v2 is shipped** (real search engine, 156 wired settings, review with
accuracy, coach context pipeline). Below is what I would add next, in the order I'd
add it, with an honest note on what each one buys you.

Picking a few from Tier 1 beats picking all of Tier 4. Effort is my estimate for
someone working steadily.

---

## Tier 1 — the things that make it feel professional

### 1. Stockfish WASM as a second engine backend
**Why:** the built-in engine is honest but shallow. Stockfish at depth 18 is what
makes a review trustworthy.
**How:** bundle `stockfish.wasm` + its worker locally (MV3 forbids remote code), run it
in a Web Worker, speak UCI. Keep the built-in engine as the fallback and as the
"explainable" engine for weights.
**Effort:** 1–2 days. **Files:** `web/core/uci-engine.js`, worker wrapper, engine picker
in Settings → Engine.

### 2. Working Lichess/Chess.com cloud eval lookup
**Why:** instant, deep evaluations without burning CPU.
**How:** `https://lichess.org/api/cloud-eval?fen=…` is public; add it as an engine option
with a local cache.
**Effort:** half a day. Ties into the existing `KEY_CACHE` storage.

### 3. Real accessibility pass
**Why:** it's the difference between a demo and something people can live in.
**How:** make the board a proper `role="grid"` with roving tabindex, aria-labels per
square ("e4, white pawn"), announce moves through a live region, add a
"blind-friendly" text mode that lists legal moves, verify contrast ratios ≥ 4.5:1.
**Effort:** 2 days. The settings (`screenReaderLabels`, `verboseAnnounce`,
`reduceMotion`) already exist and are inert — wire them.

### 4. Move annotation + notes
**Why:** studying means writing things down.
**How:** per-ply notes (localStorage), `{comment}` support in PGN import/export
(already stripped on import — preserve it), a "study list" of positions.
**Effort:** 1 day.

### 5. Keyboard-only play and navigation
**Why:** power users live on the keyboard; it's also an a11y requirement.
**How:** arrow keys move a cursor, Enter picks up / drops, Escape cancels. Shortcuts
already exist for navigation and already respect the `keyboardShortcuts` setting.
**Effort:** 1 day.

---

## Tier 2 — depth that changes what the app can do

### 6. Opening repertoire trainer (spaced repetition)
**Why:** the single most useful study feature for improving players.
**How:** store a repertoire as a PGN tree, quiz positions with FSRS/SM-2 scheduling,
track accuracy per line. Reuses the existing move generator and PGN parser.
**Effort:** 3–4 days.

### 7. Puzzle mode from your own games
**Why:** "find the move you missed" is the highest-value training loop.
**How:** review already computes the better move at every ply. Export blunder plies as
puzzles ("White to play, mate in 2"), then quiz them later.
**Effort:** 2 days, mostly UI. The data is already there in `review.rows`.

### 8. Endgame tablebase drills
**Why:** endgames are where rating is actually won.
**How:** `https://tablebase.lichess.ovh/standard?fen=…` for exact results; drill
KQ vs K, KP vs K, Lucena, Philidor. Fully local once cached.
**Effort:** 2–3 days.

### 9. Multi-game analytics
**Why:** patterns across 100 games are invisible one game at a time.
**How:** import a month of games, run batch review, chart: accuracy by phase, blunder
rate by time control, worst openings, time-of-day performance. This is what
"study" tools usually lack.
**Effort:** 3–4 days. Batch review is the only expensive part — run it in a worker.

### 10. Time-management analysis
**Why:** clock use is a top-three cause of lost games and nobody shows it well.
**How:** Chess.com PGNs include `%clk` comments. Parse them (the parser already strips
comments — preserve clock tags instead) and chart time spent vs. position complexity.
**Effort:** 2 days.

---

## Tier 3 — polish and reach

### 11. Sound design
Currently one oscillator beep. Real piece sounds (bundled, licensed) with per-event
mapping: move, capture, castle, check, promote, game end.
**Effort:** half a day.

### 12. Theme editor with live preview
Themes exist as 10 presets. Let users pick both square colours, piece set, board
background, arrow colours, and save custom themes as named entries.
**Effort:** 1 day.

### 13. PWA + offline install
Service worker precache, `manifest.webmanifest`, install prompt. Then the web app
works with no network at all.
**Effort:** half a day.

### 14. Cross-device sync
Export/import exists as JSON. Real sync needs a backend — or use a user-owned
GitHub Gist / a WebDAV endpoint. Keep it optional and off by default.
**Effort:** 2–3 days, plus a privacy story.

### 15. Localisation
318 strings in `en`. Extract to a `strings/en.json`, add a language picker. The
coach already responds in 10 languages; the UI doesn't.
**Effort:** 2 days for the mechanism, ongoing for translations.

### 16. Streaming coach responses
`settings.streamResponses` exists but is inert — the code deliberately disables it.
Implement SSE parsing for OpenAI and Anthropic so answers appear as they're generated.
**Effort:** 1 day.

---

## Tier 4 — platform

### 17. Lichess import
Mirror of the Chess.com importer: `https://lichess.org/api/games/user/{user}` (NDJSON).
Doubles the addressable audience for a day's work.

### 18. Chess variants
Chess960 first (the FEN parser already accepts arbitrary castling rights; the
generator assumes standard home squares), then Three-check, King of the Hill,
Crazyhouse. The rules core needs a `variant` field and per-variant legality.

### 19. Native mobile wrapper
Capacitor or Tauri around the same `web/` folder. The app is already responsive and
keyboard-free-friendly.

### 20. Engine tournament mode
Play the built-in engine at adjustable strength (the randomness + blunder-chance
settings already exist), then review your own game immediately. Closes the loop.

---

## What I would *not* build

- Anything that reads a live board, overlays advice on a live game, or tries to look
  human to a cheat detector. Chess.com's policy names browser extensions explicitly,
  their detection is statistical across your game history, and ~0.2% of 28,000 appeals
  were granted in Q1 2025. There is no version of that which ends well — and it's the
  opposite of the anti-cheat framing you started from.
- Scraping Chess.com's internal endpoints. Their API docs explicitly ask you not to and
  their terms forbid it. The published API is enough for everything here.
- Copying their board palettes, piece art, or move-classification glyphs. Their docs ask
  developers not to; neutral themes are already in place.

## Where the code is soft today

| Area | Honest state |
| --- | --- |
| Search | ~20k nodes/sec, depth 4 in ~200 ms. Fine for tactics, not a Stockfish replacement. No null-move, no LMR, transposition table is partial. |
| Review accuracy | Our own win-probability formula, not calibrated against a large corpus. Labels are heuristic. |
| Opening book | 50 named lines, no ECO database, no transpositions. |
| Coach | Single-turn context plus optional history. No tool use (it can't run the engine itself). |
| Extension | Side panel only, Chrome 114+. No Firefox build (MV3 sidebar API differs). |
| Tests | 141 assertions across core, DOM and extension. No visual regression, no e2e in a real browser. |

## Suggested sequence

1. Stockfish worker + engine picker (Tier 1.1) — biggest single quality jump.
2. Accessibility pass (Tier 1.3) — must before any public release.
3. Puzzle mode from your games (Tier 2.7) — highest value per day of work, data already computed.
4. Notes + PGN comments (Tier 1.4) — makes it a study tool rather than a viewer.
5. Batch review + analytics (Tier 2.9) — the "wow, this found something I didn't know" feature.
