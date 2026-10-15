// Real packaged WASM + English model, using synthetic audio rather than a mic.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-chess-vosk-'));
  const extension = path.resolve(__dirname, '../extension');
  let context;
  try {
    const knight = await fs.readFile(path.join(__dirname, 'fixtures/audio/knight-e-six.wav'));
    const pcm = samplesFromWav(knight);
    const micAudio = Buffer.alloc(44 + (8000 + pcm.length + 24000) * 2);
    micAudio.write('RIFF'); micAudio.writeUInt32LE(micAudio.length - 8, 4); micAudio.write('WAVEfmt ', 8);
    micAudio.writeUInt32LE(16, 16); micAudio.writeUInt16LE(1, 20); micAudio.writeUInt16LE(1, 22);
    micAudio.writeUInt32LE(16000, 24); micAudio.writeUInt32LE(32000, 28); micAudio.writeUInt16LE(2, 32); micAudio.writeUInt16LE(16, 34);
    micAudio.write('data', 36); micAudio.writeUInt32LE(micAudio.length - 44, 40);
    pcm.forEach((sample, i) => micAudio.writeInt16LE(Math.round(sample * 32768), 44 + (8000 + i) * 2));
    const micFile = path.join(profile, 'microphone.wav');
    await fs.writeFile(micFile, micAudio);
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${micFile}`],
    });
    const fixture = await fs.readFile(path.join(__dirname, 'fixtures/rush.html'), 'utf8');
    await context.route('https://www.chess.com/**', route => route.fulfill({
      contentType: 'text/html', body: fixture,
      // Vosk must not need the page to permit eval, WASM, or workers.
      headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; worker-src 'none'; frame-src 'self';" },
    }));
    const page = await context.newPage();
    const errors = [], remote = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('https://www.chess.com/puzzles/rush');
    await page.locator('#voice-chess-control').waitFor();
    context.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
    await context.setOffline(true);
    const mic = page.locator('#voice-chess-control .main button');
    const status = page.locator('#voice-chess-control .status');
    const transcript = page.locator('#voice-chess-control .transcript');

    async function position(fen, moves) {
      await page.evaluate(({ fen, moves }) => { Object.assign(fixture, { fen, moves, submitted: [] }); }, { fen, moves });
      // Let the page's position observer swap recognizers before the next clip.
      await page.waitForTimeout(750);
    }
    async function audio(name) {
      const wav = await fs.readFile(path.join(__dirname, 'fixtures/audio', name + '.wav'));
      const samples = samplesFromWav(wav);
      samples.unshift(...Array(8000).fill(0));
      samples.push(...Array(name.startsWith('stop') ? 48000 : 24000).fill(0)); // Endpoint silence; no force-finalization.
      await page.evaluate(async samples => {
        for (let start = 0; start < samples.length; start += 4096) {
          if (!window.audioProcessor?.onaudioprocess) break;
          const data = new Float32Array(4096);
          data.set(samples.slice(start, start + 4096));
          window.audioProcessor.onaudioprocess({ inputBuffer: { getChannelData: () => data } });
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      }, samples);
      await page.waitForTimeout(750); // Allow the final/reset round trip before the next clip.
    }
    const submitted = () => page.evaluate(() => fixture.submitted);

    await position('6k1/8/8/8/5N2/8/8/4K3 w - - 0 1', [{ from: 'f4', to: 'e6', san: 'Ne6' }]);
    await mic.click();
    await page.waitForFunction(() => document.querySelector('#voice-chess-control').shadowRoot.querySelector('.status').textContent === 'Listening · offline', null, { timeout: 60000 });
    await audio('knight-e-six');
    await page.waitForFunction(() => fixture.submitted.length === 1, null, { timeout: 10000 }).catch(async error => { console.error('Vosk transcript:', await transcript.textContent(), 'status:', await status.textContent(), errors); throw error; });
    assert.equal((await submitted())[0].to, 'e6');
    console.log('✓ Real Vosk recognizes fast synthetic “knight e six” offline');

    for (const [clip, fen, moves, target] of [
      ['knight-takes-g-five', '6k1/8/8/6p1/4N3/8/8/4K3 w - - 0 1', [{ from: 'e4', to: 'g5', san: 'Nxg5' }], 'g5'],
      ['queen-h-seven', '4k3/7p/8/8/8/8/8/4K2Q w - - 0 1', [{ from: 'h1', to: 'h7', san: 'Qxh7+' }], 'h7'],
      ['a-eight-knight', '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['Q', 'N'].map(promotion => ({ from: 'a7', to: 'a8', promotion, san: 'a8=' + promotion })), 'a8'],
      ['d-e', '4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1', [{ from: 'd4', to: 'e5', san: 'dxe5' }], 'e5'],
    ]) {
      await position(fen, moves);
      await audio(clip);
      await page.waitForFunction(() => fixture.submitted.length === 1, null, { timeout: 10000 }).catch(async error => { console.error(clip, await transcript.textContent(), await status.textContent(), errors); throw error; });
      assert.equal((await submitted())[0].to, target);
      if (clip === 'a-eight-knight') assert.equal((await submitted())[0].promotion, 'N');
    }
    console.log('✓ Real decoder handles knight captures, queen shorthand, underpromotion and file-pair captures');

    await position('4k3/8/8/8/8/8/3N4/4K1N1 w - - 0 1', [
      { from: 'g1', to: 'f3', san: 'Ngf3' }, { from: 'd2', to: 'f3', san: 'Ndf3' },
    ]);
    await audio('knight-f-three');
    await page.waitForFunction(() => /Ngf3 or Ndf3|Unclear speech/.test(document.querySelector('#voice-chess-control').shadowRoot.querySelector('.status').textContent), null, { timeout: 10000 }).catch(async error => { console.error('Ambiguous:', await transcript.textContent(), await status.textContent()); throw error; });
    assert.equal((await submitted()).length, 0);
    await audio('unrelated');
    assert.equal((await submitted()).length, 0);
    await audio('stop');
    if (await mic.getAttribute('aria-pressed') === 'true') await audio('stop-listening');
    await page.waitForFunction(() => fixture.tracksStopped === 1, null, { timeout: 10000 }).catch(async error => { console.error('Stop:', await transcript.textContent(), await status.textContent(), errors); throw error; });
    assert.equal(await mic.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(remote, [], 'Recognition must not request network assets or send audio');
    assert.deepEqual(errors, []);
    console.log('✓ Real decoder preserves source ambiguity, rejects unrelated speech, and recognizes stop');

    await page.goto('https://www.chess.com/puzzles/rush?capture=real');
    await page.locator('#voice-chess-control').waitFor();
    await position('6k1/8/8/8/5N2/8/8/4K3 w - - 0 1', [{ from: 'f4', to: 'e6', san: 'Ne6' }]);
    await mic.click();
    await page.waitForFunction(() => fixture.submitted.length === 1, null, { timeout: 60000 }).catch(async error => { console.error('Capture:', await status.textContent(), await transcript.textContent(), errors); throw error; });
    assert.equal((await submitted())[0].to, 'e6');
    await mic.click();
    await page.waitForFunction(() => capturedStream.getTracks().every(track => track.readyState === 'ended'));
    assert.deepEqual(errors, []);
    console.log('✓ Native getUserMedia and AudioContext deliver synthetic microphone audio; stopping ends real media tracks');
  } finally {
    await context?.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

function samplesFromWav(wav) {
  let offset = 12;
  while (wav.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + wav.readUInt32LE(offset + 4) + (wav.readUInt32LE(offset + 4) % 2);
  const length = wav.readUInt32LE(offset + 4);
  return Array.from({ length: length / 2 }, (_, i) => wav.readInt16LE(offset + 8 + i * 2) / 32768);
}
