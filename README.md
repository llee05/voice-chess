# Voice Chess

A minimal browser extension for **Chess.com Puzzle Rush**. Click the microphone, speak a move in standard algebraic notation (SAN), keep solving.

Vanilla JavaScript, HTML, CSS, and Manifest V3. No framework, build step, backend, API key, or runtime dependencies. Chess.com's board supplies legal moves and processes the moves you request.

## Install

1. Download or clone this repository.
2. In **Google Chrome**, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this repository's **`extension/`** folder.
4. Open [Puzzle Rush](https://www.chess.com/puzzles/rush), or reload it if it is already open.
5. Start a rush. Click the Voice Chess microphone below or beside the board and allow microphone access for Chess.com. On a small screen with no room around the board, scroll down to the control at the end of the page.

The extension is ready to load directly; installing Node or running npm is unnecessary for normal use. Google Chrome is the primary target. Other Chromium browsers can load it, but their speech service may be unavailable. Firefox is not supported.

## Commands

| Notation | Say | Action |
| --- | --- | --- |
| `e4` / `e5` | “e four” / “e five” | Move a pawn |
| `Nf3` | “knight f three” or “N f three” | Move a knight |
| `Qxh7` | “queen takes h seven” | Capture with the queen |
| `exd5` | “e takes d five” | Capture with the e-file pawn |
| `Ngf3` | “knight g f three” | Specify the knight's file |
| `R1e2` | “rook one e two” | Specify the rook's rank |
| `O-O` / `O-O-O` | “O O” / “O O O” | Castle |
| `e8=Q` / `e8=N` | “e eight equals queen” / “e eight equals knight” | Promote to the specified piece |
| `Qh7+` / `Qh7#` | “queen h seven check” / “queen h seven checkmate” | Include check or mate |
| — | “stop” | Turn the microphone off |
| — | “help” | Expand the command examples |

Moves must use SAN, following the [PGN notation specification](https://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm). Spoken piece names and numbers normalize to that notation. Captures require `x`, ambiguous pieces require the appropriate file or rank, and promotions require `=Q`, `=R`, `=B`, or `=N`. Check (`+`) and mate (`#`) are optional; if supplied, they must be correct. In compact notation, uppercase `Bxd5` is a bishop capture and lowercase `bxd5` is a pawn capture; say “bishop takes d five” to identify the bishop clearly.

Source/destination commands (`e2e4`, “e two to e four”), NATO files, phrases such as “knight to f three”, and multiple moves in one utterance are rejected. Use one SAN move at a time. For a rank-disambiguated bishop move, use uppercase `B` or say “bishop” (`B4e5`, “bishop four e five”); lowercase `b4e5` is rejected as a coordinate command. “stop” and “help” remain voice controls.

Only final recognition results trigger moves. The move must match the board's own legal SAN. Immediately before submission, the extension rechecks the board instance, position, and availability of the requested move. When more than one piece could match, the extension displays disambiguated notation such as `Ngf3` or `Ndf3`; it never picks one for you. A legal move can still be an incorrect puzzle answer: Chess.com decides that. The extension does not read puzzle solutions or select moves.

The mic stays on between puzzles and reconnects after a normal speech-service timeout, with a short delay and a limit of four consecutive restarts without a new final result. Repeated final events are ignored; if one event contains several final utterances, only the first is used and the others are discarded. It switches off when you hide the tab, navigate away from Puzzle Rush, click the button, or say “stop”. Return to the tab and click the mic to resume. A rejected submission is not automatically replayed.

## Privacy and troubleshooting

Audio recognition uses the browser's [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). Chrome may send audio to its speech service, so an internet connection can be required. Voice Chess does not record audio, persist transcripts, or send data to a backend. The latest transcript is displayed only in memory on the page.

The extension declares no additional API permissions and injects scripts only on the standard `https://www.chess.com/puzzles/rush` route. The content scripts run in the [page's JavaScript world](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) to reach its board API. The toolbar popup opens Puzzle Rush; microphone permission is requested on the puzzle page after you click the control.

- **No control:** reload the Puzzle Rush tab after loading or updating the extension. Use the standard URL above.
- **Microphone denied:** allow the microphone in Chess.com's address-bar site settings, then click the mic again.
- **Speech unavailable or connection error:** use Google Chrome with internet access and a working microphone. Some Chromium builds expose the API without a working recognition service.
- **Wrong transcript:** speak one SAN move, using piece names and clear file letters and numbers. Recognition accuracy and latency depend on your browser, microphone, and connection.
- **Board does not change:** ensure a rush is running, wait for animations, and use the mouse if the site rejects the request. Toggle the mic to retry the same command deliberately.

Chess.com's board API is undocumented and may change. The adapter checks its expected methods and stops with a message when they are unavailable. Its integration approach is informed by the public [Chess Helper board adapter](https://github.com/everyonesdesign/Chess-Helper/blob/master/app/src/chessboard/component-chessboard/index.ts). The extension was loaded on the live logged-out Puzzle Rush page and its board methods were checked. Live signed-in Puzzle Rush and real microphone recognition still need a manual check; automated tests use a simulated board API and speech events, not a Chess.com account.

## Development

Requires Node 22+ and a Chromium executable for browser checks:

```sh
npm ci
npm test
npm run check
npm run test:browser
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. Playwright is a development-only dependency; browser tests load the actual unpacked extension on an intercepted Chess.com URL. They cover command delivery, ambiguity, duplicate speech events, stale positions, black-side puzzles, underpromotion, microphone denial, failed submissions, navigation, hidden-tab cleanup, keyboard access, and narrow or short viewports. The visual screenshot is saved to `artifacts/voice-chess.png` and clearly labels the local test board.

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
