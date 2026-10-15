# Voice Chess

A minimal browser extension for **Chess.com Puzzle Rush**. Click the microphone, speak a move in standard algebraic notation (SAN) or common shorthand, keep solving.

Vanilla JavaScript, HTML, CSS, and Manifest V3. No framework, build step, backend, API key, or runtime dependencies. Chess.com's board supplies legal moves and processes the moves you request.

## Install

1. Download or clone this repository.
2. In **Google Chrome**, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this repository's **`extension/`** folder.
4. Open [Puzzle Rush](https://www.chess.com/puzzles/rush), or reload it if it is already open.
5. Start a rush. Click the Voice Chess microphone below the board or in a clear corner of the window and allow microphone access for Chess.com. If every visible position would cover the board or page controls, scroll down to the control at the end of the page.

The extension is ready to load directly; installing Node or running npm is unnecessary for normal use. Google Chrome is the primary target. Other Chromium browsers can load it, but their speech service may be unavailable. Firefox is not supported.

## Commands

| Notation | Say | Action |
| --- | --- | --- |
| `e4` / `e5` | “e four” / “e five” | Move a pawn |
| `Nf3` | “knight f three” or “N f three” | Move a knight |
| `Qxh7` | “queen takes h seven” or “queen h seven” | Capture with the queen; “takes” is optional |
| `exd5` | “e takes d five” or “e d five” | Capture with the e-file pawn; `ed5` also works |
| `dxe5` | “d e” or “d takes e” | File-only pawn capture (`de`); requires one matching legal move |
| `Ngf3` | “knight g f three” | Specify the knight's file |
| `R1e2` | “rook one e two” | Specify the rook's rank |
| `O-O` / `O-O-O` | “O O” / “O O O”, “short castle” / “long castle” | Castle kingside / queenside; “castle king side” / “castle queen side” also work |
| Either castle | “castle” | Castle only when exactly one side is legal |
| `e8=Q` / `e8=N` | “e eight queen” / “e eight knight” | Promote to the specified piece; “equals” is optional (`e8Q`, `e8N`) |
| `dxe8=N` | “d e knight” or “d e eight knight” | Capture and promote; the promotion piece remains mandatory |
| `Qh7+` / `Qh7#` | “queen h seven check” / “queen h seven checkmate” | Include check or mate |
| — | “stop” | Turn the microphone off |

SAN follows the [PGN notation specification](https://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm). Spoken piece names and numbers normalize to that notation, and supported shorthand is matched against the board's own legal SAN. You may omit `x` or “takes”: `Qh7` can match `Qxh7`, and `de5` can match `dxe5`. Explicit `x` or “takes” still requires a capture. Pawn captures must include both files; `e5` alone does not request a pawn capture.

For pawn captures you may also omit the destination rank: `de` or “d e” matches a legal d-file pawn capture onto the e-file, including en passant. If both `dxe5` and `dxe3` are legal, the control shows both and waits; say “d e five” to specify the rank. Likewise, “castle” works when exactly one castling move is legal. If both sides are legal, specify “short castle” / “castle kingside” or “long castle” / “castle queenside”. Shorthand never chooses a puzzle answer for you.

Ambiguous pieces still require the appropriate file or rank. Promotions require an explicit queen, rook, bishop, or knight, even if the board lists only one promotion; you may omit `=` or “equals” (`e8Q`, “e eight queen”, `deN`). Check (`+`) and mate (`#`) are optional; if supplied, they must be correct. Uppercase `B` or the spoken word “bishop” identifies a bishop; lowercase `b` identifies the pawn file in capture shorthand (`Be5` is a bishop move, `be5` requests `bxe5`). Say “bishop e five” to identify the bishop clearly.

Common number homophones are accepted at the destination rank: “knight f for” → `Nf4`, “queen h to” → `Qh2`, “rook a won” → `Ra1`, and “e ate queen” → `e8=Q`. This does not enable filler such as “knight to f three” or source/destination commands.

Source/destination commands (`e2e4`, “e two to e four”), NATO files, phrases such as “knight to f three”, and multiple moves in one utterance are rejected. Use one move at a time. For a rank-disambiguated bishop move, use uppercase `B` or say “bishop” (`B4e5`, “bishop four e five”); lowercase `b4e5` is rejected as a coordinate command. “stop” remains a voice control.

Only final recognition results trigger moves. The move must match the board's own legal SAN. Immediately before submission, the extension rechecks the board instance, position, and availability of the requested move. When more than one piece could match, the extension displays disambiguated notation such as `Ngf3` or `Ndf3`; it never picks one for you. A legal move can still be an incorrect puzzle answer: Chess.com decides that. The extension does not read puzzle solutions or select moves.

Recognition uses the browser's first preferred English locale (for example, `en-AU`), falling back to `en-US`. It [requests up to five transcript alternatives](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/maxAlternatives) per final utterance, though the speech service may return fewer. A move can be recovered from an alternative when the matching candidates identify one legal move. If candidates point to different legal moves, or a candidate leaves the source piece ambiguous, the status shows the SAN choices and asks you to repeat. When an alternative is used, the transcript shows “original → accepted”. A possible “stop” command in any returned alternative turns off the microphone.

Recognition handles one utterance at a time and [requests finalization when the browser detects the end of speech](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop). The status shows “Recognizing…” while the final transcript is pending. Only a final result can submit a move; recognition rearms after 50 ms when an utterance completes. Actual recognition latency still depends on the browser's speech service.

Final moves submit immediately when the board is ready. Once the position changes, the next final command can submit without a fixed pause between moves. An unchanged position remains protected against overlapping submissions.

The mic stays armed between moves and puzzles. A speech-service disconnection without a final result reconnects after 300 ms, with a limit of four consecutive restarts without a new final result. Repeated final events are ignored; if one event contains several final utterances, only the first is used and the others are discarded. It switches off when you hide the tab, navigate away from Puzzle Rush, click the button, or say “stop”. Return to the tab and click the mic to resume. A rejected submission is not automatically replayed.

## Privacy and troubleshooting

Audio recognition uses the browser's [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). Chrome may send audio to its speech service, so an internet connection can be required. Voice Chess does not record audio, persist transcripts, or send data to a backend. The latest transcript is displayed only in memory on the page.

The extension declares no additional API permissions and injects scripts only on the standard `https://www.chess.com/puzzles/rush` route. The content scripts run in the [page's JavaScript world](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) to reach its board API. The toolbar popup opens Puzzle Rush; microphone permission is requested on the puzzle page after you click the control.

- **No control:** reload the Puzzle Rush tab after loading or updating the extension. Use the standard URL above.
- **Microphone denied:** allow the microphone in Chess.com's address-bar site settings, then click the mic again.
- **Speech unavailable or connection error:** use Google Chrome with internet access and a working microphone. Some Chromium builds expose the API without a working recognition service.
- **Wrong transcript:** use full piece names and keep the file and rank distinct (“knight, f, three”). Leave a brief pause between moves so Chrome can finish each utterance. If shorthand or alternative transcripts are ambiguous, repeat the full SAN shown in the status. Recognition accuracy and latency depend on your browser, microphone, and connection; the extension cannot reconstruct speech that the browser did not capture.
- **Board does not change:** ensure a rush is running, wait for animations, and use the mouse if the site rejects the request. Toggle the mic to retry the same command deliberately.

Chess.com's board API is undocumented and may change. The adapter checks its expected methods and move data, including consistent promotion choices, and stops with a message when they are unavailable. Its integration approach is informed by the public [Chess Helper board adapter](https://github.com/everyonesdesign/Chess-Helper/blob/master/app/src/chessboard/component-chessboard/index.ts). The extension was loaded on the live logged-out Puzzle Rush page and its board methods were checked. Live signed-in Puzzle Rush and real microphone recognition still need a manual check; automated tests use a simulated board API and speech events, not a Chess.com account.

## Development

Requires Node 22+ and a Chromium executable for browser checks:

```sh
npm ci
npm test
npm run check
npm run test:browser
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. Playwright is a development-only dependency; browser tests load the actual unpacked extension on an intercepted Chess.com URL. They cover SAN and shorthand delivery, transcript alternatives and conflicts, number homophones, English locale selection, ambiguous pawn captures and castling, duplicate speech events, stale positions, black-side puzzles, underpromotion, microphone denial, failed submissions, navigation, hidden-tab cleanup, keyboard access, narrow or short viewports, and page containers that clip overflow. These checks simulate recognition results; they do not measure real microphone accuracy. The visual screenshot is saved to `artifacts/voice-chess.png` and clearly labels the local test board.

`npm run check` validates Puzzle Rush injection scope, content script order and syntax, permissions, version alignment, and packaged icon dimensions.

```text
extension/
  manifest.json   Narrow Puzzle Rush scope, no extra API permissions
  commands.js     Speech grammar and legal-move selection
  board.js        Chess.com board API adapter
  speech.js       Recognition lifecycle and reconnect behavior
  content.js      Small page control and command delivery
  popup.html/css  Toolbar shortcut to Puzzle Rush
  icons/          Packaged PNGs and editable SVG source
tests/            Unit tests and browser fixture
```

After editing, click **Reload** for Voice Chess in `chrome://extensions`, then refresh Puzzle Rush. To regenerate PNG icons from the SVG, run `node scripts/icons.cjs`.
