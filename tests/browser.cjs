const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-chess-browser-'));
  const extension = path.resolve(__dirname, '../extension');
  const fixture = await fs.readFile(path.join(__dirname, 'fixtures/rush.html'), 'utf8');
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  try {
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
    const speak = (text, final = true) => page.evaluate(({ text, final }) => window.speak(text, final), { text, final });
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

    await reset({ fen: '4k3/7p/8/8/8/8/8/4K2Q w - - 0 1', moves: [{ from: 'h1', to: 'h7', san: 'Qxh7+' }] });
    await mic.click();
    await speak('Qh7');
    assert.equal((await submitted()).length, 0);
    await speak('queen takes h seven');
    assert.equal((await submitted())[0].to, 'h7');
    assert.equal(await status.textContent(), 'Sent Qxh7+');
    console.log('✓ Capture marker required; omitted check suffix allowed');

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

    await reset({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', moves: ['Q', 'N'].map(promotion => ({ from: 'a7', to: 'a8', promotion, san: 'a8=' + promotion })) });
    await mic.click();
    await speak('a8');
    assert.equal((await submitted()).length, 0);
    await speak('a eight equals knight');
    assert.equal((await submitted())[0].promotion, 'N');
    console.log('✓ Native promotion handling');

    await reset({ reject: true });
    await mic.click();
    await speak('Ngf3');
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
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#voice-chess-control').isVisible(), false);
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.recognizers.at(-1).aborted), true);
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
    const controlBounds = await page.locator('#voice-chess-control').boundingBox();
    const boardBounds = await page.locator('wc-chess-board').boundingBox();
    assert.ok(controlBounds.y > boardBounds.y + boardBounds.height, 'Control should sit below the board when there is room');
    await page.locator('#voice-chess-control summary').click();
    await fs.mkdir(path.resolve(__dirname, '../artifacts'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/voice-chess.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/voice-chess-compact.png') });
    const compact = await page.locator('#voice-chess-control').boundingBox();
    assert.ok(compact.x >= 0 && compact.x + compact.width <= 390);
    assert.ok(compact.y >= 0 && compact.y + compact.height <= 844);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed. Screenshot: artifacts/voice-chess.png');
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
