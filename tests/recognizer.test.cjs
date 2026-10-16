const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const decoders = [], messages = [], listeners = {};
  const parent = {};
  const port = { postMessage: value => messages.push(value), start() {}, close() {} };
  class Decoder {
    constructor(rate, grammar) {
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
  const configure = (epoch = 1) => send({ type: 'configure', epoch, sampleRate: 16000, phrases: ['knight f three', 'stop'] });
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

test('delivers a complete transcript once without decoding it again', () => {
  for (const text of ['knight f three then bishop c four', 'queue knight f three', 'premove bishop c four']) {
    const f = fixture(); f.audio(); f.decoders[0].emit('result', text);
    assert.equal(f.decoders.length, 1);
    assert.equal(f.messages.filter(message => message.type === 'result').length, 1);
    assert.equal(f.messages.at(-1).text, text, 'Speech layer must receive the whole transcript for rejection');
    f.audio(); f.decoders[0].emit('result', 'knight f three');
    assert.equal(f.messages.filter(message => message.type === 'result').length, 1);
  }
});

test('position changes discard the previous decoder and its late results', () => {
  const f = fixture(); f.audio(); f.decoders[0].emit('partialresult', 'knight f');
  f.configure(2);
  f.decoders[0].emit('result', 'knight f three');
  f.decoders[0].emit('error', '');
  assert.equal(f.messages.some(message => message.type === 'result' || message.type === 'error'), false);
  assert.equal(f.decoders[0].removed, true);
  f.decoders[1].emit('result', 'knight f three');
  assert.equal(f.messages.at(-1).epoch, 2);
});

test('empty finals leave the decoder available for the next utterance', () => {
  const f = fixture(); f.audio(); f.decoders[0].emit('result', '');
  f.audio(); f.decoders[0].emit('result', 'knight f three');
  assert.equal(f.decoders.length, 1);
  assert.equal(f.messages.filter(message => message.type === 'result').length, 1);
  assert.equal(f.messages.at(-1).text, 'knight f three');
});

test('oversized final text becomes a consumable rejection so listening can continue', () => {
  const f = fixture(); f.audio();
  f.decoders[0].emit('result', 'knight f three '.repeat(20));
  assert.equal(f.messages.at(-1).text, '[unk]');
  f.configure(2); f.decoders[1].emit('result', 'knight f three');
  assert.equal(f.messages.at(-1).text, 'knight f three');
});

test('audio processing limits pending chunks and reports decoder errors', () => {
  const f = fixture();
  for (let index = 0; index < 17; index++) f.audio();
  assert.equal(f.decoders[0].audio.length, 16);
  assert.equal(f.messages.at(-1).type, 'error');
  const g = fixture();
  g.decoders[0].acceptWaveformFloat = () => { throw new Error('Decoder unavailable'); };
  g.audio();
  assert.equal(g.messages.at(-1).type, 'error');
  assert.equal(g.messages.some(message => message.type === 'result'), false);
});
