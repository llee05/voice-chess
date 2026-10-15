const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-chess-browser-'));
  const extension = path.resolve(__dirname, '../extension');
  const fixture = await fs.readFile(path.join(__dirname, 'fixtures/rush.html'), 'utf8');
  let context;
  const errors = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      viewport: { width: 1280, height: 800 },
      locale: 'en-AU',
    });
    await context.route('https://www.chess.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function reset(overrides = {}) {
      await page.goto('https://www.chess.com/puzzles/rush');
      await page.locator('#voice-chess-control').waitFor();
      await page.evaluate(value => { Object.assign(window.fixture, value); }, overrides);
    }
    const mic = page.locator('#voice-chess-control button');
    const status = page.locator('#voice-chess-control .status');
    const speak = (text, final = true, alternatives = []) => page.evaluate(({ text, final, alternatives }) => window.speak(text, final, alternatives), { text, final, alternatives });
    const submitted = () => page.evaluate(() => window.fixture.submitted);

    await reset();
    await mic.click();
    await speak('knight f three', false);
    assert.equal((await submitted()).length, 0);
    await speak('knight f three');
    assert.match(await status.textContent(), /Ngf3 or Ndf3/);
    assert.equal((await submitted()).length, 0);
    await speak('e2e4');
    await speak('g one to f three');
    await speak('b four e five');
    assert.match(await status.textContent(), /Use standard notation/);
    assert.equal((await submitted()).length, 0);
    await speak('knight g f three');
    assert.equal((await submitted()).length, 1);
    assert.equal((await submitted())[0].userGenerated, true);
    assert.equal(await status.textContent(), 'Sent Ngf3');
    await speak('Ngf3');
    assert.equal((await submitted()).length, 1);
    await page.waitForTimeout(650);
    await speak('stop');
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    console.log('✓ Spoken SAN, disambiguation, coordinate rejection, duplicate protection, voice stop');

    await reset({ fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', moves: [{ from: 'e2', to: 'e4', san: 'e4' }] });
    await mic.click();
    await speak('e four');
    assert.equal((await submitted())[0].to, 'e4');
    assert.equal(await status.textContent(), 'Sent e4');
    console.log('✓ Pawn SAN without a source square');

    await reset({ fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', moves: [{ from: 'g1', to: 'f3', san: 'Nf3' }] });
    await mic.click();
    assert.equal(await page.evaluate(() => window.recognizers.at(-1).lang), 'en-AU');
    assert.equal(await page.evaluate(() => window.recognizers.at(-1).maxAlternatives), 5);
    await speak('nice f tree', false, ['knight f three']);
    assert.equal((await submitted()).length, 0);
    await speak('nice f tree', true, ['knight f three', 'Nf3']);
    assert.equal((await submitted())[0].to, 'f3');
    assert.equal(await status.textContent(), 'Sent Nf3');
    assert.equal(await page.locator('#voice-chess-control .transcript').textContent(), 'nice f tree → knight f three');
    await page.evaluate(() => {
      fixture.fen = '4k3/8/8/8/8/5N2/8/4K3 w - - 1 2';
      fixture.moves = [{ from: 'f3', to: 'g5', san: 'Ng5' }];
      const recognition = window.recognizers.at(-1);
      recognition.onresult({ resultIndex: 0, results: recognition.results });
    });
    assert.equal((await submitted()).length, 1);
    await speak('night g five');
    assert.equal((await submitted()).length, 2);
    console.log('✓ Preferred English locale, final transcript alternatives, visible correction, and no replay');

    await reset({ fen: '4k3/8/8/8/8/8/3PP3/4K3 w - - 0 1', moves: [
      { from: 'e2', to: 'e4', san: 'e4' }, { from: 'd2', to: 'd4', san: 'd4' },
    ] });
    await mic.click();
    await speak('e for', true, ['d four']);
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /e4 or d4/);
    await speak('e for');
    assert.equal((await submitted())[0].to, 'e4');
    console.log('✓ Destination-rank homophones work; conflicting legal transcripts require repetition');

    await reset({ fen: '6k1/8/8/8/5N2/8/8/4K3 w - - 0 1', moves: [{ from: 'f4', to: 'e6', san: 'Ne6' }] });
    await mic.click();
    await speak('96', false);
    assert.equal((await submitted()).length, 0);
    await speak('96');
    assert.equal((await submitted())[0].to, 'e6');
    assert.equal(await status.textContent(), 'Sent Ne6');
    console.log('✓ The reported numeric knight transcript 96 resolves to Ne6 only on a final result');

    await reset({ fen: '6k1/8/8/2N5/5N2/8/8/4K3 w - - 0 1', moves: [
      { from: 'f4', to: 'e6', san: 'Nfe6' }, { from: 'c5', to: 'e6', san: 'Nce6' },
    ] });
    await mic.click();
    await speak('96');
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /Nfe6 or Nce6/);
    await speak('knight f e six');
    assert.equal((await submitted())[0].from, 'f4');
    console.log('✓ Repaired numeric knight speech still requires source disambiguation');

    await reset({ fen: '6k1/8/8/6p1/4N3/8/8/4K3 w - - 0 1', moves: [{ from: 'e4', to: 'g5', san: 'Nxg5' }] });
    await mic.click();
    await speak('nothing g5');
    assert.equal((await submitted())[0].to, 'g5');
    assert.equal(await status.textContent(), 'Sent Nxg5');
    console.log('✓ The reported nothing g5 transcript resolves to the requested knight capture');

    await reset({ fen: '6k1/8/8/8/4N3/8/8/4K3 w - - 0 1', moves: [{ from: 'e4', to: 'g5', san: 'Ng5' }] });
    await mic.click();
    await speak('nothing g5');
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /No legal move matches Nxg5/);
    console.log('✓ The nothing repair requires a capture and cannot submit a quiet knight move');

    await reset();
    await mic.click();
    await speak('knight g f three', true, ['knight f three']);
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /Ngf3 or Ndf3/);
    await speak('knight g f three', true, ['stop']);
    assert.equal((await submitted()).length, 0);
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    console.log('✓ Alternative transcripts preserve source ambiguity and honor a possible stop command');

    await reset();
    await mic.click();
    await speak('Ngf3', false);
    assert.equal((await submitted()).length, 0);
    await page.evaluate(() => window.recognizers.at(-1).onspeechend());
    assert.equal(await page.evaluate(() => window.recognizers.at(-1).stopCalls), 1);
    assert.equal((await submitted()).length, 0);
    assert.equal(await status.textContent(), 'Recognizing…');
    await speak('Ngf3');
    assert.equal((await submitted()).length, 1);
    await page.evaluate(() => window.recognizers.at(-1).onend());
    await page.waitForFunction(() => window.recognizers.length === 2);
    assert.equal(await mic.getAttribute('aria-pressed'), 'true');
    assert.equal(await status.textContent(), 'Sent Ngf3');
    console.log('✓ Speech-end finalization waits for final SAN and rearms without losing status');

    await reset();
    await mic.click();
    const rapid = await page.evaluate(() => {
      window.speak('Ngf3');
      // Simulate Rush finishing its reply and making the next move available,
      // without advancing timers between these final recognition results.
      fixture.fen = '4k3/8/8/8/8/5N2/3N4/4K3 w - - 1 2';
      fixture.moves = [{ from: 'f3', to: 'g5', san: 'Ng5' }];
      window.speak('Ng5');
      return fixture.submitted;
    });
    assert.equal(rapid.length, 2, 'A changed board must accept the next final move without a fixed cooldown');
    assert.equal(rapid[1].to, 'g5');
    await page.waitForTimeout(650);
    assert.equal(await status.textContent(), 'Sent Ng5');
    console.log('✓ Final moves submit immediately after the board changes');

    await reset();
    await mic.click();
    await speak('Ngf3');
    await page.waitForTimeout(650);
    await page.evaluate(() => {
      fixture.fen = '4k3/8/8/8/8/8/3N4/4K1N1 w - - 1 2';
      const recognition = window.recognizers.at(-1);
      recognition.onresult({ resultIndex: 0, results: recognition.results });
    });
    assert.equal((await submitted()).length, 1);
    await speak('Ngf3');
    assert.equal((await submitted()).length, 2);
    console.log('✓ Repeated final events cannot replay against a new puzzle position');

    await reset({ fen: '4k3/7p/8/8/8/8/8/4K2Q w - - 0 1', moves: [{ from: 'h1', to: 'h7', san: 'Qxh7+' }] });
    await mic.click();
    await speak('queen h seven', false);
    assert.equal((await submitted()).length, 0);
    await speak('queen h seven');
    assert.equal((await submitted())[0].to, 'h7');
    assert.equal(await status.textContent(), 'Sent Qxh7+');
    console.log('✓ Omitted capture marker and check suffix resolve to native SAN on final results');

    await reset({ fen: '4k3/8/8/4p3/3P4/4p3/3P4/4K3 w - - 0 1', moves: [
      { from: 'd4', to: 'e5', san: 'dxe5' }, { from: 'd2', to: 'e3', san: 'dxe3' },
    ] });
    await mic.click();
    await speak('de');
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /dxe5 or dxe3/);
    await speak('d e five');
    assert.equal((await submitted())[0].from, 'd4');
    assert.equal((await submitted())[0].to, 'e5');
    assert.equal(await status.textContent(), 'Sent dxe5');
    console.log('✓ Rankless pawn captures show ambiguity; saying the rank selects the requested move');

    await reset({ fen: '4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1', moves: [{ from: 'd4', to: 'e5', san: 'dxe5' }] });
    await mic.click();
    await speak('d e', false);
    assert.equal((await submitted()).length, 0);
    await speak('d e');
    assert.equal((await submitted())[0].to, 'e5');
    assert.equal(await status.textContent(), 'Sent dxe5');
    console.log('✓ A unique file-only pawn capture submits the native move');

    await reset({ fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', moves: [
      { from: 'e1', to: 'g1', san: 'O-O' }, { from: 'e1', to: 'c1', san: 'O-O-O' },
    ] });
    await mic.click();
    await speak('castle');
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /O-O or O-O-O/);
    await speak('long castle');
    assert.equal((await submitted())[0].to, 'c1');
    assert.equal(await status.textContent(), 'Sent O-O-O');
    console.log('✓ Bare castle reports both sides; long castle specifies queenside');

    await reset({ fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1', moves: [{ from: 'e1', to: 'g1', san: 'O-O' }] });
    await mic.click();
    await speak('castle');
    assert.equal((await submitted())[0].to, 'g1');
    assert.equal(await status.textContent(), 'Sent O-O');
    console.log('✓ Bare castle submits when only one side is legal');

    await reset({ mode: 'passive-observing' });
    await mic.click();
    assert.match(await status.textContent(), /Start a Puzzle Rush/);
    assert.equal(await page.evaluate(() => window.recognizers?.length ?? 0), 0);
    console.log('✓ Idle board does not start the microphone');

    await reset({ fen: '4k1n1/8/8/8/8/8/8/4K3 b - - 0 1', player: 2, moves: [{ from: 'g8', to: 'f6', san: 'Nf6' }] });
    await mic.click();
    await speak('Nf6');
    assert.equal((await submitted())[0].from, 'g8');
    console.log('✓ Black-side Puzzle Rush');

    await reset({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', moves: [{ from: 'a7', to: 'a8', promotion: 'Q', san: 'a8=N' }] });
    await mic.click();
    assert.match(await status.textContent(), /consistent promotion choices/);
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    assert.equal((await submitted()).length, 0);
    console.log('✓ Inconsistent promotion data leaves the board untouched');

    await reset({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', moves: ['Q', 'N'].map(promotion => ({ from: 'a7', to: 'a8', promotion, san: 'a8=' + promotion })) });
    await mic.click();
    await speak('a8');
    assert.equal((await submitted()).length, 0);
    await speak('a eight knight');
    assert.equal((await submitted())[0].promotion, 'N');
    console.log('✓ Native promotion handling');

    await reset({ fen: '4r1k1/3P4/8/8/8/8/8/4K3 w - - 0 1', moves: [
      { from: 'd7', to: 'e8', promotion: 'N', san: 'dxe8=N' },
    ] });
    await mic.click();
    await speak('de');
    assert.equal((await submitted()).length, 0, 'Even a single promotion option requires a spoken piece');
    await speak('d e knight');
    assert.equal((await submitted())[0].promotion, 'N');
    assert.equal(await status.textContent(), 'Sent dxe8=N');
    console.log('✓ Rankless capture promotions require and preserve the requested piece');

    await reset();
    await mic.click();
    await page.evaluate(() => {
      const game = document.querySelector('wc-chess-board').game;
      const getMoves = game.getLegalMoves;
      let reads = 0;
      game.getLegalMoves = () => {
        if (++reads === 2) {
          fixture.fen = fixture.fen.replace('0 1', '1 2');
          game.getLegalMoves = getMoves;
        }
        return getMoves();
      };
    });
    await speak('Ngf3');
    assert.match(await status.textContent(), /puzzle changed/);
    assert.equal((await submitted()).length, 0);
    await speak('Ngf3');
    assert.equal((await submitted()).length, 1);
    console.log('✓ Stale validation reports the cause and permits a fresh command');

    await reset({ reject: true });
    await mic.click();
    await speak('Ngf3');
    await speak('Ndf3');
    assert.equal((await submitted()).length, 1, 'Unchanged positions must keep the in-flight submission locked');
    await page.waitForTimeout(650);
    assert.match(await status.textContent(), /Board rejected/);
    await speak('Ngf3');
    assert.equal((await submitted()).length, 1);
    console.log('✓ Failed submission does not replay');

    await reset({ throwAfterMove: true });
    await mic.click();
    await speak('Ngf3');
    await page.waitForTimeout(650);
    assert.match(await status.textContent(), /Sent Ngf3/);
    assert.equal((await submitted()).length, 1);
    console.log('✓ Board exception after accepting input');

    await reset();
    await mic.click();
    await page.evaluate(() => window.recognizers.at(-1).onerror({ error: 'not-allowed' }));
    assert.match(await status.textContent(), /Allow the microphone/);
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    console.log('✓ Microphone denial');

    await mic.click();
    await page.evaluate(() => { history.pushState({}, '', '/play/online'); });
    assert.equal(await page.locator('#voice-chess-control').isVisible(), false);
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.recognizers.at(-1).aborted), true);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.recognizers.length), 2);
    await page.evaluate(() => { history.pushState({}, '', '/puzzles/rush'); });
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#voice-chess-control').isVisible(), true);
    console.log('✓ Navigation stops the microphone and hides the control');

    await reset();
    await mic.click();
    const other = await context.newPage();
    await other.goto('https://www.chess.com/');
    await other.bringToFront();
    // Headless Chromium may keep all pages visible; dispatch the same platform
    // event with its actual hidden property set for deterministic coverage.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    assert.equal(await other.locator('#voice-chess-control').count(), 0);
    await other.close();
    console.log('✓ Hidden-tab pause and no injection outside Puzzle Rush');

    await reset();
    await mic.click();
    await page.evaluate(() => window.recognizers.at(-1).onend());
    await page.evaluate(() => { history.replaceState({}, '', '/puzzles'); });
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.recognizers.length), 1);
    console.log('✓ Navigation cancels a pending recognition restart');

    await reset();
    const controlBounds = await page.locator('#voice-chess-control').boundingBox();
    const boardBounds = await page.locator('wc-chess-board').boundingBox();
    assert.ok(controlBounds.y > boardBounds.y + boardBounds.height, 'Control should sit below the board when there is room');
    await mic.focus();
    await mic.press('Enter');
    assert.equal(await mic.getAttribute('aria-pressed'), 'true');
    assert.equal(await mic.getAttribute('aria-label'), 'Stop listening');
    await mic.press('Space');
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    assert.equal(await mic.getAttribute('aria-label'), 'Start listening');
    assert.equal(await page.locator('#voice-chess-control details, #voice-chess-control summary').count(), 0);
    assert.match(await page.locator('#voice-chess-control .privacy').textContent(), /speech online/);
    await fs.mkdir(path.resolve(__dirname, '../artifacts'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/voice-chess.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#voice-chess-control').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/voice-chess-compact.png') });
    const compact = await page.locator('#voice-chess-control').boundingBox();
    assert.ok(compact.x >= 0 && compact.x + compact.width <= 390);
    assert.ok(compact.y >= 0 && compact.y + compact.height <= 844);
    const rushControl = await page.locator('.rush-control').boundingBox();
    assert.ok(compact.y + compact.height <= rushControl.y || compact.y >= rushControl.y + rushControl.height, 'The panel must not cover Rush controls below the board');
    await page.setViewportSize({ width: 240, height: 844 });
    await page.locator('#voice-chess-control').scrollIntoViewIfNeeded();
    const narrow = await page.locator('#voice-chess-control').boundingBox();
    assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 240, 'Control must fit very narrow viewports');
    await page.setViewportSize({ width: 390, height: 400 });
    await page.locator('#voice-chess-control').scrollIntoViewIfNeeded();
    await page.waitForTimeout(550);
    const short = await page.locator('#voice-chess-control').boundingBox();
    const shortBoard = await page.locator('wc-chess-board').boundingBox();
    assert.ok(short.y >= shortBoard.y + shortBoard.height, 'Control must not cover the board when the viewport is short');
    assert.ok(short.x >= 0 && short.x + short.width <= 390);
    assert.ok(short.y >= 0 && short.y + short.height <= 400);
    await page.setViewportSize({ width: 1280, height: 650 });
    await page.locator('#voice-chess-control').scrollIntoViewIfNeeded();
    const desktopShort = await page.locator('#voice-chess-control').boundingBox();
    const desktopRushControl = await page.locator('.rush-control').boundingBox();
    assert.ok(desktopShort.y >= desktopRushControl.y + desktopRushControl.height, 'Short desktop layouts must keep native Rush controls accessible');
    console.log('✓ Keyboard controls, narrow viewports, and board clearance on short screens');

    await page.setViewportSize({ width: 1325, height: 667 });
    await reset();
    await page.evaluate(() => {
      // Rush can use a fixed page container that clips children added after it.
      document.body.style.cssText = 'position: fixed; inset: 0; overflow: hidden; transform: translateX(24px);';
      window.dispatchEvent(new Event('resize'));
    });
    async function assertControlVisible() {
      const bounds = await page.locator('#voice-chess-control').boundingBox();
      assert.ok(bounds.x >= 12 && bounds.x + bounds.width <= 1313, 'Control must retain its horizontal viewport insets');
      assert.ok(bounds.y >= 12 && bounds.y + bounds.height <= 655, 'Control must be visible without scrolling a clipped page');
      const board = await page.locator('wc-chess-board').boundingBox();
      const native = await page.locator('.rush-control').boundingBox();
      const overlaps = other => bounds.x < other.x + other.width && bounds.x + bounds.width > other.x && bounds.y < other.y + other.height && bounds.y + bounds.height > other.y;
      assert.equal(overlaps(board), false, 'Control must keep board input accessible');
      assert.equal(overlaps(native), false, 'Control must keep Rush settings accessible');
    }
    await assertControlVisible();
    await mic.click();
    await speak('G6', false);
    await assertControlVisible();
    await speak('help');
    assert.match(await status.textContent(), /Use standard notation/);
    assert.equal((await submitted()).length, 0);
    await page.waitForFunction(() => {
      const bounds = document.querySelector('#voice-chess-control').getBoundingClientRect();
      return bounds.top >= 12 && bounds.bottom <= innerHeight - 12;
    });
    await assertControlVisible();
    await page.waitForTimeout(550);
    await assertControlVisible();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/voice-chess-clipped-page.png') });
    console.log('✓ Clipped page containers keep the mic, transcript, and status on screen');
    assert.deepEqual(errors, []);
    console.log('Browser checks passed. Screenshot: artifacts/voice-chess.png');
  } finally {
    await context?.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
