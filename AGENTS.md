# Repository Instructions

## Commits and scope

- Organize each task into logical, focused commits. Each commit should represent a coherent change with a clear purpose. Keep unrelated changes in separate commits.
- Write commit messages that describe the changes and their purpose. Never include AI attribution, AI authorship acknowledgments, or AI co-author trailers in commit messages.
- Inspect `git status` before editing. Preserve existing user changes and stage only the files that belong to the task.
- Keep `README.md` consistent with changes to installation, supported commands, permissions, browser support, and behavior.

## Product and stack

- Puzzle Rush Voice is a browser extension for **Chess.com Puzzle Rush**. The former Android app has been removed.
- Keep the app minimal: vanilla JavaScript, HTML, CSS, Manifest V3, and the browser's Web Speech API. The `extension/` folder is directly loadable, with no build step or runtime dependencies.
- Avoid adding frameworks, bundlers, backend services, API keys, or runtime dependencies unless the requested feature needs them. Playwright is a development-only dependency.
- Google Chrome is the primary target. Other Chromium browsers may lack a working speech service. Firefox is not currently supported; do not claim support without implementing and verifying it.
- This is an input tool: execute moves the user requests. Do not add puzzle solving, engine analysis, solution scraping, or automatic move selection as part of routine maintenance.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `extension/manifest.json` | Extension metadata, page matching, script order, and packaged assets |
| `extension/commands.js` | Pure transcript parsing and selection from supplied legal moves |
| `extension/board.js` | Chess.com's board API, position snapshots, and move submission |
| `extension/queue.js` | Bounded move queue, observed position continuity, and submission tracking |
| `extension/speech.js` | Speech recognition lifecycle, final results, and bounded reconnection |
| `extension/content.js` | Page control, command delivery, duplicate protection, and navigation handling |
| `extension/popup.html`, `extension/popup.css` | Toolbar shortcut to Puzzle Rush |
| `extension/icons/` | Editable SVG source and packaged PNG icons |
| `tests/*.test.cjs` | Node unit tests for commands, board integration, and speech lifecycle |
| `tests/browser.cjs`, `tests/fixtures/rush.html` | Actual unpacked-extension checks with a simulated board and speech service |
| `scripts/check.cjs` | Manifest, script syntax, permissions, and packaged asset checks |
| `scripts/icons.cjs` | PNG icon generation from the SVG using Chromium |

## Extension architecture

- Content scripts are classic scripts, loaded in this order: `commands.js`, `board.js`, `queue.js`, `speech.js`, `content.js`. Preserve their shared `VoiceChessCommands`, `VoiceChessBoard`, `VoiceChessQueue`, and `VoiceChessSpeech` bindings and dependency order. Do not introduce module imports without updating how the extension loads them.
- Scripts run in the `MAIN` page world so they can access the board's `game` object. Do not assume isolated-world extension APIs such as `chrome.runtime` or `chrome.storage` are available there.
- Keep page matching and runtime route checks limited to Puzzle Rush. Changes must continue to stop the microphone and hide the control when Chess.com navigates elsewhere without reloading.
- The manifest currently declares no extra API permissions or host permissions. Keep permissions limited to what the feature actually requires and update checks and documentation if they change.
- Keep DOM and site API access out of the parser. Keep Chess.com's undocumented API usage behind `board.js`; verify changed assumptions against the live site when accessible.
- Fail with a clear status when required board methods, the position, or the player's side are unavailable. Do not guess a position or silently substitute a different move.

## Move handling

- Only final recognition results may submit moves. Interim results are for display.
- Accept standard algebraic notation (SAN) for moves (`e4`, `Nf3`, `Qxh7`, `Ngf3`, `O-O`, `e8=Q`) and documented shorthand. Spoken piece names, ranks, and notation symbols may normalize to SAN (e.g. “knight f three” → `Nf3`). Support omitted capture markers, pawn capture file pairs (`de`), castling phrases, and omitted promotion equals signs. Accept explicit `queue`/`premove` commands and chains separated by `then`; reject source/destination commands, NATO files, extra filler, and unseparated move lists.
- Queue only the user's requested moves, resolving each against native legal SAN when its turn arrives. Never infer future replies or legality. Keep queues bounded and cancel them on ambiguity, rejection, stopping, or an unverified position transition. Never replay a pending or uncertain submission.
- Chaining and premoves activate automatically while listening. Do not require a queue-entry click or separate setup utterance. Keep ordinary recognition constrained to current legal moves; use bounded in-memory re-decoding for detected chains and prefixes before submitting any part.
- Resolve requests against the board's own complete legal SAN. Shorthand must identify one move; show the matching SAN choices when ambiguous. Explicit capture markers must match captures, pawn captures still require both files, and promotion pieces remain mandatory. Check/mate suffixes may be omitted; when supplied they must match. Do not implement a second rules engine or infer legality from piece movement geometry.
- Never pick between ambiguous source pieces. Show the matching disambiguated SAN choices and leave the board untouched.
- Confirm the board instance and FEN still match the snapshot immediately before submission. Block moves on idle, disabled, animating, finished, or opponent-turn positions.
- Submit through the board's ordinary input handling with `userGenerated: true`. Preserve the native promotion representation; require a promotion piece in the requested SAN, including for queen promotion.
- Prevent duplicate submissions and never automatically replay a rejected move. Some board versions throw after accepting input, so an exception alone does not justify retrying.
- A legal move may be the wrong puzzle answer. Chess.com determines puzzle correctness; do not present legal-move validation as solution validation.

## Speech and privacy

- Begin listening only after the user clicks the microphone control. Keep recognition on the puzzle page rather than in the short-lived toolbar popup.
- Stop and release recognition on a spoken stop command, button toggle, hidden tab, page exit, or navigation outside Puzzle Rush. Discard late events and cancel pending restarts after stopping.
- Reconnect only after recoverable disconnections, with a delay and a bounded retry count. Permission denial, microphone failure, and service errors must not cause an endless retry loop.
- Do not persist audio or transcripts or introduce telemetry. Keep the browser speech service's possible online audio processing clear in the UI and README; do not claim offline recognition.
- Treat page-world data as untrusted. Use `textContent` for transcripts and status messages; do not interpolate them into HTML.

## UI and assets

- Preserve the small microphone control, current status/transcript, and collapsible examples. Avoid adding dashboards or settings for features that do not need them.
- Keep the control in a Shadow DOM to avoid style conflicts. Position it below the board when there is room, and check that it does not obstruct board interaction or Rush controls.
- Maintain keyboard access, visible focus, an accessible microphone label and pressed state, readable contrast, and live status feedback. Check narrow viewports for clipping.
- Edit `extension/icons/icon.svg` as the icon source. Regenerate packaged PNGs with `node scripts/icons.cjs` when changing the icon.
- Keep screenshot artifacts and `node_modules/` out of commits. Keep manifest and package versions aligned when changing the release version.

## Development and validation

Requires Node 22+ for development. Browser checks use Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another executable.

```sh
npm ci
npm test
npm run check
npm run test:browser
```

- For runtime changes, run `npm test` and `npm run check`. Run `npm run test:browser` when changes affect injection, board integration, command delivery, speech behavior, or UI.
- Add regression coverage for meaningful parsing or lifecycle changes. Favor tests that check observable behavior, especially ambiguity, promotions, stale positions, duplicate delivery, microphone errors, and cleanup.
- For documentation-only changes, review the referenced paths and commands and run `git diff --check`; application tests are unnecessary.
- Browser tests intercept a Chess.com URL with a local fixture and simulate recognition events. Distinguish these results from live signed-in gameplay and real microphone testing. Never claim a manual check was performed when only fixture tests passed.
- For a manual check, load `extension/` unpacked in `chrome://extensions`, reload the Puzzle Rush tab, start a rush, and try voice moves. Confirm ambiguity handling and stopping the mic when leaving the tab. Report checks unavailable because of account access or speech service limitations.
- After source changes, reload the extension in `chrome://extensions` and refresh the Puzzle Rush tab. No production build command is required.
