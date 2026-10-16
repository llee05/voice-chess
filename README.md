# Voice Chess

A minimal browser extension for **Chess.com Puzzle Rush**. Click the microphone, speak a move in standard algebraic notation (SAN) or common shorthand, keep solving.

Vanilla JavaScript, HTML, CSS, and Manifest V3, with a bundled [Vosk](https://alphacephei.com/vosk/) English recognizer. No build step, backend, API key, or separate model installation. Chess.com's board supplies legal moves and processes the moves you request.

## Install

1. Download or clone this repository, including `extension/vendor/` (the model is included).
2. In **Google Chrome**, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this repository's **`extension/`** folder.
4. Open [Puzzle Rush](https://www.chess.com/puzzles/rush), or reload it if it is already open.
5. Start a rush. Click the Voice Chess microphone below the board or in a clear corner of the window and allow microphone access for Chess.com. If every visible position would cover the board or page controls, scroll down to the control at the end of the page.
6. Wait for **Listening · offline**, then say one move. The bundled model loads into memory when you start listening.

No Node installation or npm command is needed for normal use. The bundled model and runtime add about **46 MB** to the unpacked extension. There is no download button or additional setup. Google Chrome is the primary target; other Chromium browsers may work but are not fully verified. Firefox is not supported.

## Commands

| Notation | Say | Action |
| --- | --- | --- |
| `e4` / `e5` | “e four” / “e five” | Move a pawn |
| `Nf3` | “knight f three” | Move a knight |
| `Qxh7` | “queen takes h seven” or “queen h seven” | Capture; “takes” is optional |
| `exd5` | “e takes d five” or “e d five” | Capture with the e-file pawn |
| `dxe5` | “d e” or “d takes e” | File-only pawn capture; requires one matching legal move |
| `Ngf3` | “knight g f three” | Specify the knight's file |
| `R1e2` | “rook one e two” | Specify the rook's rank |
| `O-O` / `O-O-O` | “short castle” / “long castle” | Castle; “castle king side” / “castle queen side” also work |
| Either castle | “castle” | Castle only when exactly one side is legal |
| `e8=Q` / `e8=N` | “e eight queen” / “e eight knight” | Promote to the specified piece; “equals” is optional |
| `dxe8=N` | “d e knight” or “d e eight knight” | Capture and promote; the piece remains mandatory |
| `Qh7+` / `Qh7#` | “queen h seven check” / “queen h seven checkmate” | Include check or mate |
| Move chain | “knight f three then bishop c four” | Automatically play your moves in order, waiting for the opponent between them |
| Append a premove | “bishop c four” while waiting, or “queue bishop c four” / “premove bishop c four” | Append a move without a separate setup command |
| Clear premoves | “clear queue” or “cancel queue” | Cancel all moves still waiting in the queue |
| — | “stop”, “pause”, “stop listening”, “pause listening”, “microphone off” | Turn the microphone off |

Speak file letters and full piece names. SAN follows the [PGN notation specification](https://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm). Spoken moves normalize to that notation and resolve against the board's own complete legal SAN. You may omit captures, check and mate markers; explicit “takes” must match a capture, and explicit check or mate must be correct. Pawn captures require both files: “e five” alone does not request a capture.

If both `dxe5` and `dxe3` are legal, “d e” shows both choices; say “d e five” to specify the rank. If both castles are legal, specify the side. Ambiguous pieces require the appropriate file, rank, or full source square as SAN disambiguation. Promotions always require a queen, rook, bishop, or knight, even when only one promotion is supplied by the board. Shorthand never chooses a puzzle answer for you.

With the microphone listening, speak a chain directly: **“knight f three then bishop c four”**. There is no queue-entry button, setup phrase, or mode to toggle. Additional single moves automatically append while the board is waiting, a submission is pending, or a queue already exists. You can also explicitly append with “queue bishop c four” or “premove bishop c four” in one utterance. To replace a pending plan, say “clear queue” before the new moves.

Separate chained moves with “then”; include only **your** moves, leaving Chess.com to play the opponent's replies. Say the complete chain in one utterance, without a long internal pause. The first move plays as soon as your turn and board are ready. Later moves are checked against the board's legal SAN on each turn; future legality is not predicted. Queues hold at most six pending moves and expire after 15 seconds without progress. The control displays the remaining moves and an optional **Clear** button.

An invalid or ambiguous queued move clears the rest and displays the reason. Queues also clear when listening stops, the tab is hidden, the page exits, the board is replaced or disabled, a submission is uncertain or unconfirmed, or an unexpected position change is observed. Continuation requires observing each transition through one of the board's native legal moves, including the submitted move itself. A reset, manual move, or skipped transition cancels the plan; queued moves are never carried forward based only on another legal match. Clearing cancels pending requests, not a move already sent to the board.

Source/destination commands (“e two to e four”), NATO files, filler (“knight to f three”), and unseparated move lists (“e four knight f three”) are rejected. Leave a brief pause after a move or complete chain for the recognizer to finish. The parser still understands compact SAN and earlier transcript corrections, but the speech engine's vocabulary uses spoken moves rather than arbitrary dictated text.

## Recognition and safety

Vosk runs locally in a worker with a vocabulary derived from **all current legal moves**, plus chain/premove markers and stop/cancel controls. When it detects “then” or a “queue …” / “premove …” prefix in a final result, it automatically re-decodes the current utterance with generic spoken notation for future moves before submitting anything. That decode must retain the detected delimiter or prefix; losing it rejects the whole utterance. While waiting to premove, generic notation is available immediately. Generic forms describe command syntax and supply no legal or preferred continuation. The vocabulary refreshes when the board, FEN, player side, or readiness changes. No puzzle solution, engine analysis, or preferred move is supplied. Ambiguous and incomplete forms are also included as guard phrases so the recognizer can pass them through for clarification or rejection rather than invent a source piece or promotion.

Vosk's constrained language model can still mishear speech or recombine words. Ordinary transcripts outside the supplied phrase list are rejected; automatic premoves and “then” chains must pass the complete command parser. A malformed or low-confidence chain is rejected in full before any of its moves are queued. Only final results can submit or queue moves; interim text is display only. A final result consumes its recognizer, and buffered or late results are discarded before the next command. Position changes invalidate pending speech and any re-decode even when the legal vocabulary happens to be identical. Queued commands remain only in memory while listening. At most 20 seconds of the current utterance's PCM is retained in memory for automatic re-decoding, then discarded; it is never saved or uploaded. An overlong utterance cannot be re-decoded as a chain and must be repeated more briefly.

Because “a”, “c”, “e”, “f”, and “g” can be confused, a final move containing any of these file letters requires a reported word confidence of at least 0.8 for each occurrence. Otherwise the control asks you to repeat and leaves the board untouched. This catches uncertain readings; a confidently misheard letter can still pass. No file is automatically substituted.

Immediately before submission, the extension rechecks the board instance, FEN, player turn, and requested move. Idle, disabled, animating, finished, and opponent-turn boards block moves. The board's own ordinary input handler processes the request. A legal move can still be an incorrect puzzle answer: Chess.com decides that. Rejected or uncertain submissions are never automatically replayed.

The microphone stays armed between moves and puzzles. It switches off when you hide the tab, navigate away from Puzzle Rush, click the button, or say “stop”. Stopping releases the microphone, audio context, recognizer frame and worker, including during model startup. Return to the tab and click the mic to resume. Microphone and model failures stop listening with a status message; there is no automatic service fallback or retry loop.

## Privacy and troubleshooting

Speech recognition is **offline**: the JavaScript/WASM runtime and US English model are bundled in `extension/vendor/`. Audio stays on the device. Voice Chess does not use Chrome's network speech service, upload audio, persist transcripts, store recordings, or introduce telemetry. PCM is processed in memory and discarded. Model files are unpacked into worker memory; they are not copied to IndexedDB. Chess.com itself still requires its usual internet connection.

The extension declares no additional API permissions. Scripts inject only on the standard `https://www.chess.com/puzzles/rush` route. The board adapter and UI run in the page's JavaScript world to reach its board API; a small isolated script connects them to a packaged extension frame. Only `recognizer.html` is web-accessible to Chess.com. The extension CSP permits packaged WebAssembly without allowing JavaScript `eval` or remote code. Microphone permission belongs to the puzzle page and is requested only after clicking the control. The toolbar popup simply opens Puzzle Rush.

- **No control:** reload the extension and refresh the Puzzle Rush tab. Use the standard URL above.
- **Microphone denied:** allow the microphone in Chess.com's address-bar site settings, then click the mic again.
- **Model cannot start:** ensure the complete `extension/vendor/` folder is present. Reload the extension and tab. The model needs several seconds to load and substantially more working memory than its archive size; closing other heavy tabs may help.
- **Wrong or unclear transcript:** use full piece names and pronounce the file letter and rank distinctly (“knight, e, six”). Wait for “Listening · offline” before the first move and leave a brief pause between moves. Repeat the disambiguated SAN shown in the status when necessary. Fast speech, accents, background noise, and microphone quality can still cause errors; legal vocabulary does not guarantee the intended move was heard.
- **Board does not change:** ensure a rush is running, wait for animations, and use the mouse if the site rejects the request. Toggle the mic to retry the same command deliberately.

Chess.com's board API is undocumented and may change. The adapter checks its methods and data, including consistent promotion choices, and fails with a message when they are unavailable. Its integration approach is informed by the public [Chess Helper board adapter](https://github.com/everyonesdesign/Chess-Helper/blob/master/app/src/chessboard/component-chessboard/index.ts). Live signed-in Puzzle Rush and real microphone recognition still need a manual check. Fixture tests and synthetic audio do not establish a real-world accuracy improvement.

## Development

Requires Node 22+ and a Chromium executable for browser checks:

```sh
npm ci
npm test
npm run check
npm run test:browser
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. Playwright is development-only. Browser checks load the unpacked extension on an intercepted Chess.com URL with a simulated board and audio capture. They test the real frame/port connection with a simulated decoder for delivery, grammar changes, ambiguity, duplicates, stale speech, promotions, microphone failures, navigation cleanup, keyboard access, and narrow/clipped layouts. A second check loads the **actual packaged Vosk worker and model**, disables networking, applies a restrictive page CSP, and decodes synthetic English chess phrases. It also passes a WAV through Chromium's fake microphone using native `getUserMedia` and `AudioContext`, and verifies media tracks end when stopped. These are not live gameplay or human microphone tests. Screenshots go to ignored `artifacts/`.

`npm run check` validates injection scope, script order and syntax, CSP, permissions, version alignment, licenses, model/runtime checksums, and icon dimensions. See [third-party assets and licenses](extension/vendor/README.md). Maintainers can refresh the pinned assets with `python scripts/vendor-vosk.py`; normal users do not run this script, and it is not a build prerequisite.

```text
extension/
  manifest.json   Puzzle Rush scope, local WASM CSP, packaged frame access
  commands.js     Transcript parsing, legal-move vocabulary and resolution
  board.js        Chess.com board API adapter
  queue.js        Bounded premoves, board continuity and submission tracking
  speech.js       Page audio capture, position epochs and recognition lifecycle
  content.js      Small page control and command delivery
  bridge.js       Isolated-world connection to the extension frame
  recognizer.*    Packaged Vosk frame and bounded audio handling
  vendor/         Checked-in Vosk runtime/model, checksums and licenses
  popup.html/css  Toolbar shortcut to Puzzle Rush
  icons/          Packaged PNGs and editable SVG source
tests/            Unit tests, browser fixtures and real-decoder smoke check
```

After editing, click **Reload** for Voice Chess in `chrome://extensions`, then refresh Puzzle Rush. No production build is required. To regenerate PNG icons from the SVG, run `node scripts/icons.cjs`.
