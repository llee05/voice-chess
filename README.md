# Voice Chess

A minimal browser extension for **Chess.com Puzzle Rush**. Click the microphone, say your move, keep solving.

Vanilla JavaScript, HTML, CSS, and Manifest V3. No framework, build step, backend, API key, or runtime dependencies. Chess.com's board supplies legal moves and processes the moves you request.

## Install

1. Download or clone this repository.
2. In **Google Chrome**, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this repository's **`extension/`** folder.
4. Open [Puzzle Rush](https://www.chess.com/puzzles/rush), or reload it if it is already open.
5. Start a rush. Click the Voice Chess microphone below the board (or in the bottom-right corner when space is tight) and allow microphone access for Chess.com.

The extension is ready to load directly; installing Node or running npm is unnecessary for normal use. Google Chrome is the primary target. Other Chromium browsers can load it, but their speech service may be unavailable. Firefox is not supported.

## Commands

| Say | Action |
| --- | --- |
| “e two to e four” | Move from e2 to e4 |
| “echo two to echo four” | The same move with phonetic files |
| “knight to f three” | Move the legal knight to f3 |
| “queen takes h seven” | Move the queen to h7 |
| “e four” | Move a pawn to e4 |
| “rook alpha to echo seven” | Specify the rook's file |
| “rook one to a four” | Specify the rook's rank |
| “castle kingside” / “castle queenside” | Castle, if legal |
| “e seven to e eight promote to knight” | Underpromote (queen is the default) |
| “stop” | Turn the microphone off |
| “help” | Expand the command examples |

Files: **alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel**. Ranks: **one** through **eight**. Coordinates such as `e2e4`, and notation such as `Nf3`, `Raxd1`, and `exd5`, are also understood if the speech service returns them.

Only final recognition results trigger moves. When multiple pieces match, the extension asks for the source square; it never picks one for you. It checks legal moves, including king safety, castling, and en passant, against the board's own rules. A legal move can still be an incorrect puzzle answer: Chess.com decides that. The extension does not read puzzle solutions or select moves.

The mic stays on between puzzles and reconnects after a normal speech-service timeout. It switches off when you hide the tab, navigate away from Puzzle Rush, click the button, or say “stop”. Return to the tab and click the mic to resume. A rejected submission is not automatically replayed.

## Privacy and troubleshooting

Audio recognition uses the browser's [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). Chrome may send audio to its speech service, so an internet connection can be required. Voice Chess does not record audio, persist transcripts, or send data to a backend. The latest transcript is displayed only in memory on the page.

The extension declares no additional API permissions and injects scripts only on the standard `https://www.chess.com/puzzles/rush` route. The content scripts run in the [page's JavaScript world](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) to reach its board API. The toolbar popup opens Puzzle Rush; microphone permission is requested on the puzzle page after you click the control.

- **No control:** reload the Puzzle Rush tab after loading or updating the extension. Use the standard URL above.
- **Microphone denied:** allow the microphone in Chess.com's address-bar site settings, then click the mic again.
- **Speech unavailable or connection error:** use Google Chrome with internet access and a working microphone. Some Chromium builds expose the API without a working recognition service.
- **Wrong transcript:** use phonetic files and full source/destination coordinates. Recognition accuracy and latency depend on your browser, microphone, and connection.
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

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. Playwright is a development-only dependency; browser tests load the actual unpacked extension on an intercepted Chess.com URL. They cover command delivery, ambiguity, duplicate suppression, black-side puzzles, underpromotion, microphone denial, failed submissions, navigation, and hidden-tab cleanup. The visual screenshot is saved to `artifacts/voice-chess.png` and clearly labels the local test board.

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
