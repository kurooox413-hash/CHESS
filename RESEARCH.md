# Research: Chess.com, fair play, and extension constraints

Notes behind the design decisions in this repo. Sources are listed at the end.

## 1. What Chess.com's rules actually say

From the official **Fair Play Policy** (`chess.com/cheating`) and the Help Center article
*"What do I need to know about Fair Play on Chess.com?"*:

| Rule | Detail |
| --- | --- |
| Engines during play | "Do not use chess engines, software of any kind, bots, plugins, **browser extensions**, or any tools that analyze positions during play." |
| Live chess | "In Live Chess, **no outside assistance of any kind** is permitted." |
| Daily chess | Books, lessons, videos and non-engine opening databases are allowed. Engines, tablebases and engine-evaluated databases are not. |
| Blunder checking | "Do not perform any automated analysis or 'blunder checking' of your games **in progress**." |
| Own notes in Live | Even your own prepared notes count as outside help in Live. |
| Bots / unrated puzzles | The rules do **not** apply to games against computers or bots. |
| Finished games | Nothing restricts engine analysis of a game **after** it is over — that is ordinary study and it's what every post-game review feature does. |

Every prohibition is scoped to **ongoing** games. That is the legal/ToS boundary this project
sits on: it is a *post-game* review and study tool. Nothing in it reads a live board.

## 2. How detection works (public facts only)

Chess.com is intentionally vague about details but publishes a lot about method and scale:

- Detection is **statistical, based on the games**, not by scanning your device. "The cheat
  detection system we've developed and maintained for more than 10 years detects suspicious
  play based on **over 100 gameplay factors**, and auto-bans players when a combination of
  these factors and accompanying statistical algorithms determines a performance to be
  extremely improbable."
- **Q1 2025:** ~20 M games analysed per day, **~314,000 accounts closed** (~3,500/day,
  ~105,000/month), **~85% automatically**, 34 titled players included. ~28,000 appeals
  reviewed, **0.2% granted**.
- Signals described publicly: move quality vs. the rating's expected level, engine
  agreement (especially in positions where humans usually go wrong), clock usage patterns,
  and account history / rate of change. Accuracy is explicitly **not** a detection metric.
- The Fair Play team has 30+ members, including GMs/titled players. Prize events use
  Proctor (camera/screen).

Why this matters for the design: a tool gets caught because *the games it produces stop
looking like the person playing them*. There is no "undetectable" overlay, and anyone
selling one is selling a ban. So the only honest version of this project is the one that
never touches a live game.

## 3. What this means for the product (decisions)

1. **Post-game only.** The app and extension have no live-game mode. The extension's content
   script on `chess.com` does not read the board, doesn't touch the DOM, and doesn't extract
   moves. It only checks `location.pathname` to know whether a live board is on screen.
2. **Fail-closed guard.** While a live page is detected, the side panel shows a red notice and
   disables Analyze / Review / AI Coach.
3. **No anti-detection anything.** No throttling of engine strength, no "human-like" move
   timing, no disguise. Those features only exist to beat detection, which is cheating.
4. **Import from the official API only.** `api.chess.com/pub` is documented, read-only,
   needs no key, and cannot send moves. No scraping of internal endpoints (that violates the
   User Agreement), no session-token tricks.
5. **Don't imitate Chess.com's IP.** Their Published Data API docs ask developers not to copy
   board palettes, piece designs, sound effects, or move-classification glyphs. This project
   uses its own neutral theme and its own blunder labels (blunder / mistake / inaccuracy).

## 4. Chrome extension constraints (Manifest V3)

- `sidePanel` permission + `side_panel.default_path`, Chrome 114+;
  `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` makes the toolbar
  icon open the panel.
- MV3 pages cannot use remote code or `eval`; everything is bundled locally and the CSP is
  `script-src 'self'`.
- **Minimum permissions:** `storage` + `sidePanel`. Host permissions limited to
  `api.chess.com` (import) and the LLM endpoints the user configures. No `tabs`, no
  `<all_urls>`, no `webRequest`.
- Content script only on `*://*.chess.com/*`, with a narrow, read-only purpose.
- Chrome Web Store policy: **single purpose**, minimum permissions, prominent data
  disclosure. A post-game study panel qualifies; "read the live board and suggest moves"
  would not, and would also break Chess.com's policy.

## 5. Data sources used

| Endpoint | Use |
| --- | --- |
| `GET /pub/player/{user}` | Profile, status (`closed:fair_play_violations` is visible here) |
| `GET /pub/player/{user}/stats` | Ratings for all time classes |
| `GET /pub/player/{user}/games/archives` | List of monthly archive URLs (ascending) |
| `GET /pub/player/{user}/games/{YYYY}/{MM}` | Finished games with `pgn`, `fen`, result codes, accuracies |
| `GET /pub/player/{user}/games/{YYYY}/{MM}/pgn` | Multi-game PGN download |
| `GET /pub/player/{user}/games/to-move` | **Not used** — that's an ongoing-game endpoint |

Notes: responses are JSON-LD parsable as plain JSON; refresh at most once per 12–24 h;
**serial** requests are unlimited but parallel requests may get `429`; ETag/Last-Modified
caching supported; send a descriptive `User-Agent`. Game result codes are a fixed enum
(`win`, `checkmated`, `agreed`, `repetition`, `timeout`, `resigned`, `stalemate`,
`insufficient`, `50move`, `abandoned`, `timevsinsufficient`, …).

## 6. Fair-play references

- Chess.com, *Cheating And Fair Play On Chess.com* — https://www.chess.com/cheating
- Chess.com Help Center, *What do I need to know about Fair Play on Chess.com?* — https://support.chess.com/en/articles/8568369
- Chess.com, *Published-Data API* — https://www.chess.com/news/view/published-data-api
- Chrome for Developers, *Side Panel API* / *Program Policies* — https://developer.chrome.com/docs/extensions/reference/api/sidePanel , https://developer.chrome.com/docs/webstore/program-policies/policies
