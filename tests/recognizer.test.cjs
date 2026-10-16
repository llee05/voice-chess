const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(options = {}) {
  const decoders = [], messages = [], listeners = {};
  const parent = {};
  const port = { postMessage: value => messages.push(value), start() {}, close() {} };
  class Decoder {
    constructor(rate, grammar) {
      if (options.failReplay && decoders.length) throw new Error('Decoder unavailable');
      this.grammar = JSON.parse(grammar); this.listeners = {}; this.audio = []; decoders.push(this);
    }
    on(type, callback) { this.listeners[type] = callback; }
    setWords() {}
    remove() { this.removed = true; }
    acceptWaveformFloat(data) { this.audio.push(data); }
    emit(type, text) {
      this.listeners[type]?.({ result: type === 'result' ? { text, result: text.split(' ').map(word => ({ word, conf: 1 })) } : { partial: text } });
    }
  }
  const window = { addEventListener: (type, callback) => { listeners[type] = callback; } };
  const Vosk = { Model: class {
    constructor() { this.ready = true; this.worker = { addEventListener() {}, terminate() {} }; }
    on(type, callback) { if (type === 'load') callback({ result: true }); }
    get KaldiRecognizer() { return Decoder; }
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/recognizer.js'), 'utf8'), {
    window, parent, Vosk, URL, Float32Array, location: { href: 'chrome-extension://test/recognizer.html' },
  });
  listeners.message({ source: parent, origin: 'https://www.chess.com', data: { type: 'voice-chess-recognizer' }, ports: [port] });
  const send = data => port.onmessage({ data });
  const configure = (epoch = 1) => send({ type: 'configure', epoch, sampleRate: 16000, phrases: ['knight f three', 'then', 'queue'], queuePhrases: ['knight f three', 'bishop c four', 'three then'] });
  configure();
  return { decoders, messages, send, configure,
    audio(value = 0.1) { send({ type: 'audio', epoch: 1, data: new Float32Array(4096).fill(value) }); },
  };
}

test('ordinary final moves keep the small decoder and consume the utterance once', () => {
  const f = fixture(); f.audio();
  f.decoders[0].emit('result', 'knight f three');
  f.decoders[0].emit('result', 'knight f three'); f.audio();
  assert.equal(f.decoders.length, 1);
  assert.equal(f.messages.filter(message => message.type === 'result').length, 1);
  assert.equal(f.decoders[0].audio.length, 1);
});

test('then automatically re-decodes the buffered utterance before delivering any move', () => {
  const f = fixture(); f.audio(0.1); f.decoders[0].emit('partialresult', 'knight f');
  f.audio(0.2); f.decoders[0].emit('result', 'knight f three then [unk]');
  assert.equal(f.decoders.length, 2);
  assert.equal(f.decoders[0].removed, true);
  assert.equal(f.messages.some(message => message.type === 'result'), false);
  const broad = f.decoders[1];
  assert.ok(broad.grammar.includes('bishop c four'));
  assert.equal(broad.audio.length, 1);
  broad.emit('partialresult', 'knight f three then');
  assert.equal(broad.audio.length, 2);
  assert.ok(broad.audio[1][0] > broad.audio[0][0], 'Replay preserves sample order');
  broad.emit('result', 'knight f three then bishop c four');
  const result = f.messages.filter(message => message.type === 'result');
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'knight f three then bishop c four');
  assert.equal(result[0].words[5].word, 'c');
  f.audio(); broad.emit('result', 'bishop c four');
  assert.equal(f.messages.filter(message => message.type === 'result').length, 1);
});

test('explicit queue and premove prefixes also re-decode without a setup command', () => {
  for (const prefix of ['queue', 'premove']) {
    const f = fixture(); f.audio(); f.decoders[0].emit('result', `${prefix} [unk]`);
    f.decoders[1].emit('result', `${prefix} bishop c four`);
    assert.equal(f.messages.at(-1).text, `${prefix} bishop c four`);
  }
});

test('lost delimiters and prefixes reject the whole utterance instead of submitting its first move', () => {
  for (const text of ['knight f three then [unk]', 'queue knight f three']) {
    const f = fixture(); f.audio(); f.decoders[0].emit('result', text);
    f.decoders[1].emit('result', 'knight f three');
    assert.equal(f.messages.at(-1).text, '[unk]');
  }
});

test('position changes discard both old decoders and their late results', () => {
  const f = fixture(); f.audio(); f.decoders[0].emit('result', 'knight f three then [unk]');
  const broad = f.decoders[1]; f.configure(2);
  broad.emit('result', 'knight f three then bishop c four');
  f.decoders[0].emit('result', 'knight f three');
  assert.equal(f.messages.some(message => message.type === 'result'), false);
  assert.equal(broad.removed, true);
  f.decoders[2].emit('result', 'knight f three');
  assert.equal(f.messages.at(-1).epoch, 2);
});

test('audio capture is bounded and an oversized chain cannot fall back to its first move', () => {
  const f = fixture();
  for (let index = 0; index < 79; index++) { f.audio(); f.decoders[0].emit('partialresult', 'knight'); }
  f.decoders[0].emit('result', 'knight f three then bishop c four');
  assert.equal(f.decoders.length, 1);
  assert.equal(f.messages.at(-1).text, '[unk]');
});

test('empty finals release prior silence while retaining pending chunks', () => {
  const f = fixture(); f.audio(); f.audio();
  f.decoders[0].emit('result', '');
  f.decoders[0].emit('result', 'knight f three then [unk]');
  assert.equal(f.decoders[1].audio.length, 1);
  f.decoders[1].emit('result', 'knight f three then bishop c four');
  assert.equal(f.messages.at(-1).text, 'knight f three then bishop c four');
});

test('oversized final text becomes a consumable rejection so listening can continue', () => {
  const f = fixture(); f.audio();
  f.decoders[0].emit('result', 'knight f three '.repeat(20));
  assert.equal(f.messages.at(-1).text, '[unk]');
  f.configure(2); f.decoders[1].emit('result', 'knight f three');
  assert.equal(f.messages.at(-1).text, 'knight f three');
});

test('a replay decoder failure reports an error and never submits the original prefix', () => {
  const f = fixture({ failReplay: true }); f.audio();
  f.decoders[0].emit('result', 'knight f three then [unk]');
  assert.equal(f.messages.at(-1).type, 'error');
  assert.equal(f.messages.some(message => message.type === 'result'), false);
});
