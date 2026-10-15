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
    await context.addInitScript({ path: path.join(__dirname, 'fixtures/fake-vosk.js') });
    await context.route('https://www.chess.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function reset(overrides = {}) {
      await page.goto('https://www.chess.com/puzzles/rush');
      await page.locator('#voice-chess-control').waitFor();
      await page.evaluate(value => { Object.assign(window.fixture, value); }, overrides);
    }
    const mic = page.locator('#voice-chess-control .main button');
    const status = page.locator('#voice-chess-control .status');
    const engine = () => page.frames().find(frame => frame.url().endsWith('/recognizer.html'));
    async function start() {
      await mic.click();
      await page.waitForFunction(() => document.querySelector('#voice-chess-control').shadowRoot.querySelector('.status').textContent === 'Listening · offline');
    }
    async function speak(text, final = true, words) {
      const frame = engine();
      const count = await frame.evaluate(({ text, final, words }) => {
        const count = fakeRecognizers.length;
        fakeRecognizers.at(-1).emit(final ? 'result' : 'partialresult', text, words);
        return count;
      }, { text, final, words });
      if (final && ['stop', 'pause', 'stop listening'].includes(text)) {
        await page.waitForFunction(() => document.querySelector('#voice-chess-control').shadowRoot.querySelector('button').getAttribute('aria-pressed') === 'false');
      } else if (final) await frame.waitForFunction(count => fakeRecognizers.length > count, count, { polling: 50 });
      else await page.waitForFunction(text => document.querySelector('#voice-chess-control').shadowRoot.querySelector('.transcript').textContent === text, text);
    }
    const submitted = () => page.evaluate(() => window.fixture.submitted);

    await reset(); await start();
    await speak('knight f three', false);
    assert.equal((await submitted()).length, 0);
    await speak('knight f three');
    assert.match(await status.textContent(), /Ngf3 or Ndf3/);
    await speak('g one to f three');
    assert.match(await status.textContent(), /Unclear speech/);
    await speak('knight g f three');
    assert.equal((await submitted()).length, 1);
    assert.equal((await submitted())[0].userGenerated, true);
    assert.equal(await status.textContent(), 'Sent Ngf3');
    await speak('knight g f three');
    assert.equal((await submitted()).length, 1);
    await speak('stop');
    await page.waitForFunction(() => fixture.tracksStopped === 1 && fixture.contextsClosed === 1);
    assert.equal(engine(), undefined);
    console.log('✓ Final-only delivery, ambiguity, exact phrases, duplicate protection, voice stop and audio cleanup');

    await reset(); await start();
    let frame = engine();
    const grammar = () => engine().evaluate(() => fakeRecognizers.at(-1).grammar);
    assert.ok((await grammar()).includes('knight g f three'));
    assert.ok((await grammar()).includes('knight f three'), 'Missing source must remain audible');
    assert.ok((await grammar()).includes('[unk]'));
    assert.ok((await grammar()).includes('stop'));
    await page.evaluate(() => {
      fixture.fen = '4k3/8/8/8/8/5N2/3N4/4K3 w - - 1 2';
      fixture.moves = [{ from: 'f3', to: 'g5', san: 'Ng5' }];
    });
    // Deliver an old result before the polling timer has refreshed the grammar.
    await frame.evaluate(() => fakeRecognizers[0].emit('result', 'knight g f three'));
    await frame.waitForFunction(() => fakeRecognizers.at(-1).grammar.includes('knight g five'), null, { polling: 50 });
    assert.equal((await submitted()).length, 0);
    assert.equal((await grammar()).includes('knight g f three'), false);
    await speak('knight g five');
    assert.equal((await submitted())[0].to, 'g5');
    console.log('✓ Legal vocabulary follows FEN; stale speech is discarded before command delivery');

    for (const scenario of [
      { fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', moves: [{ from: 'e2', to: 'e4', san: 'e4' }], phrase: 'e four', san: 'e4' },
      { fen: '6k1/8/8/8/5N2/8/8/4K3 w - - 0 1', moves: [{ from: 'f4', to: 'e6', san: 'Ne6' }], phrase: 'knight e six', san: 'Ne6' },
      { fen: '6k1/8/8/6p1/4N3/8/8/4K3 w - - 0 1', moves: [{ from: 'e4', to: 'g5', san: 'Nxg5' }], phrase: 'knight takes g five', san: 'Nxg5' },
      { fen: '4k3/7p/8/8/8/8/8/4K2Q w - - 0 1', moves: [{ from: 'h1', to: 'h7', san: 'Qxh7+' }], phrase: 'queen h seven', san: 'Qxh7+' },
      { fen: '4k1n1/8/8/8/8/8/8/4K3 b - - 0 1', player: 2, moves: [{ from: 'g8', to: 'f6', san: 'Nf6' }], phrase: 'knight f six', san: 'Nf6' },
    ]) {
      await reset(scenario); await start(); await speak(scenario.phrase);
      assert.equal((await submitted()).length, 1);
      assert.equal(await status.textContent(), 'Sent ' + scenario.san);
    }
    console.log('✓ Pawn, knight, capture, queen shorthand and black-side moves');

    await reset({ fen: '4k3/8/8/8/8/8/P4P2/4K3 w - - 0 1', moves: [
      { from: 'a2', to: 'a4', san: 'a4' }, { from: 'f2', to: 'f4', san: 'f4' },
    ] });
    await start();
    await speak('a four', true, [{ word: 'a', conf: 0.6 }, { word: 'four', conf: 1 }]);
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /Unclear file letter/);
    await speak('f four');
    assert.equal((await submitted()).length, 1);
    assert.equal((await submitted())[0].to, 'f4');
    assert.equal(await status.textContent(), 'Sent f4');
    console.log('✓ Uncertain a/f recognition leaves both legal moves untouched; a clear repeat submits f4');

    await reset({ fen: '4k3/8/8/8/8/8/2P1P1P1/4K3 w - - 0 1', moves: [
      { from: 'c2', to: 'c4', san: 'c4' }, { from: 'e2', to: 'e4', san: 'e4' }, { from: 'g2', to: 'g4', san: 'g4' },
    ] });
    await start();
    for (const file of ['e', 'c', 'g']) {
      await speak(`${file} four`, true, [{ word: file, conf: 0.6 }, { word: 'four', conf: 1 }]);
      assert.equal((await submitted()).length, 0);
      assert.match(await status.textContent(), /Unclear file letter/);
    }
    await speak('g four');
    assert.equal((await submitted()).length, 1);
    assert.equal((await submitted())[0].to, 'g4');
    assert.equal(await status.textContent(), 'Sent g4');
    console.log('✓ Uncertain e/c/g files require repetition; a clear repeat submits g4');

    await reset({ fen: '6k1/8/8/8/4N3/8/8/4K3 w - - 0 1', moves: [{ from: 'e4', to: 'g5', san: 'Ng5' }] });
    await start(); await speak('knight takes g five');
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /No legal move/);
    await speak('knight g five');
    assert.equal((await submitted()).length, 1);

    await reset({ fen: '4k3/8/8/4p3/3P4/4p3/3P4/4K3 w - - 0 1', moves: [
      { from: 'd4', to: 'e5', san: 'dxe5' }, { from: 'd2', to: 'e3', san: 'dxe3' },
    ] });
    await start(); await speak('d e');
    assert.equal((await submitted()).length, 0);
    assert.match(await status.textContent(), /dxe5 or dxe3/);
    await speak('d e five');
    assert.equal((await submitted())[0].to, 'e5');

    await reset({ fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', moves: [
      { from: 'e1', to: 'g1', san: 'O-O' }, { from: 'e1', to: 'c1', san: 'O-O-O' },
    ] });
    await start(); await speak('castle');
    assert.match(await status.textContent(), /O-O or O-O-O/);
    assert.equal((await submitted()).length, 0);
    await speak('castle queen side');
    assert.equal((await submitted())[0].to, 'c1');

    await reset({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', moves: ['Q', 'N'].map(promotion => ({ from: 'a7', to: 'a8', promotion, san: 'a8=' + promotion })) });
    await start(); await speak('a eight');
    assert.equal((await submitted()).length, 0);
    await speak('a eight knight');
    assert.equal((await submitted())[0].promotion, 'N');
    console.log('✓ Capture markers, ambiguous pawn shorthand and castle, and mandatory underpromotion piece');

    await reset({ reject: true }); await start();
    await speak('knight g f three'); await speak('knight d f three');
    assert.equal((await submitted()).length, 1);
    await page.waitForTimeout(650);
    assert.match(await status.textContent(), /Board rejected/);
    await speak('knight g f three');
    assert.equal((await submitted()).length, 1);
    await reset({ throwAfterMove: true }); await start(); await speak('knight g f three');
    await page.waitForTimeout(650);
    assert.equal((await submitted()).length, 1);
    assert.equal(await status.textContent(), 'Sent Ngf3');
    console.log('✓ Rejected and uncertain submissions never replay');

    await reset({ mode: 'passive-observing' }); await mic.click();
    assert.match(await status.textContent(), /Start a Puzzle Rush/);
    assert.equal(engine(), undefined);
    await reset({ micError: 'NotAllowedError' }); await mic.click();
    await page.waitForFunction(() => document.querySelector('#voice-chess-control').shadowRoot.querySelector('.status').textContent.includes('Allow the microphone'));
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    await reset(); await start();
    await page.evaluate(() => history.pushState({}, '', '/play/online'));
    await page.waitForFunction(() => fixture.tracksStopped === 1);
    assert.equal(await page.locator('#voice-chess-control').isVisible(), false);
    assert.equal(engine(), undefined);
    await reset(); await start();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(() => fixture.tracksStopped === 1);
    await page.goto('https://www.chess.com/');
    assert.equal(await page.locator('#voice-chess-control').count(), 0);
    console.log('✓ Idle board, permission denial, route exit, hidden tab and injection scope');

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
    assert.match(await page.locator('#voice-chess-control .privacy').textContent(), /Offline speech/);
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
    await page.waitForFunction(() => document.querySelector('#voice-chess-control').shadowRoot.querySelector('.status').textContent === 'Listening · offline');
    await speak('g six', false);
    await assertControlVisible();
    await speak('help');
    assert.match(await status.textContent(), /Unclear speech/);
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
