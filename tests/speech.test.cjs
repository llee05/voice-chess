const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const Speech = load('speech.js', 'VoiceChessSpeech');
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const states = [], transcripts = [], commands = [], connections = [], contexts = [];
  const tasks = new Map();
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const node = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
  class AudioContext {
    constructor() { this.sampleRate = 16000; contexts.push(this); }
    async resume() {}
    createMediaStreamSource() { return this.source = node(); }
    createScriptProcessor() { return this.processor = node(); }
    async close() { this.closed = true; }
  }
  let vocabulary = { key: 1, phrases: ['stop', 'knight f three', 'queen h seven'] };
  const session = new Speech({
    AudioContext,
    getUserMedia: options.getUserMedia ?? (async () => stream),
    getVocabulary: () => vocabulary,
    connect() {
      const connection = { port: { sent: [], start() {}, postMessage(message) { this.sent.push(message); } }, close() { this.closed = true; } };
      connections.push(connection);
      return connection;
    },
    timers: { setTimeout(fn) { const id = Symbol(); tasks.set(id, fn); return id; }, clearTimeout(id) { tasks.delete(id); } },
    onState: (...args) => states.push(args), onTranscript: text => transcripts.push(text),
    onCommand(text) { commands.push(text); if (options.command) options.command(session, text); },
  });
  function emit(type, text, epoch = session.epoch, connection = connections.at(-1)) {
    connection.port.onmessage({ data: { type, text, epoch } });
  }
  function ready() { emit('loaded'); emit('ready'); }
  return { session, commands, states, transcripts, contexts, connections, tasks, track, stream, emit, ready,
    vocabulary(value) { vocabulary = value; } };
}

test('starts once, processes audio only after model readiness, submits only a final phrase', async () => {
  const f = fixture();
  await f.session.start(); await f.session.start();
  assert.equal(f.connections.length, 1);
  const audio = () => f.contexts[0].processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array([0.1, -0.2]) } });
  audio();
  assert.equal(f.connections[0].port.sent.filter(message => message.type === 'audio').length, 0);
  f.ready(); audio();
  const sent = f.connections[0].port.sent.find(message => message.type === 'audio');
  assert.equal(sent.data.length, 2);
  assert.equal(sent.epoch, f.session.epoch);
  f.emit('partial', 'knight f three');
  assert.deepEqual(f.commands, []);
  f.emit('result', 'knight f three');
  assert.deepEqual(f.commands, ['knight f three']);
  assert.equal(f.session.active, true);
  assert.deepEqual(f.states.at(-1), [true, 'Listening · offline']);
});

test('one final consumes the recognizer and discards repeated or buffered results', async () => {
  const f = fixture(); await f.session.start(); f.ready();
  const epoch = f.session.epoch;
  f.emit('result', 'knight f three');
  f.emit('result', 'queen h seven', epoch);
  assert.deepEqual(f.commands, ['knight f three']);
  f.emit('ready');
  f.emit('result', 'queen h seven');
  assert.deepEqual(f.commands, ['knight f three', 'queen h seven']);
});

test('changed positions invalidate queued speech, even when the vocabulary is identical', async () => {
  const f = fixture(); await f.session.start(); f.ready();
  const epoch = f.session.epoch;
  f.vocabulary({ key: 2, phrases: ['stop', 'knight f three', 'queen h seven'] });
  f.emit('result', 'knight f three', epoch);
  assert.deepEqual(f.commands, []);
  assert.notEqual(f.session.epoch, epoch);
  f.emit('ready'); f.emit('result', 'knight f three');
  assert.deepEqual(f.commands, ['knight f three']);
});

test('rejects unknown words, recombined phrases, filler and multiple moves', async () => {
  const f = fixture(); await f.session.start(); f.ready();
  for (const text of ['[unk]', 'knight h seven', 'please knight f three', 'knight f three queen h seven']) {
    f.emit('result', text); f.emit('ready');
  }
  assert.deepEqual(f.commands, []);
  assert.match(f.states.at(-1)[1], /Unclear speech/);
  f.emit('result', 'queen h seven');
  assert.deepEqual(f.commands, ['queen h seven']);
});

test('stop commands close microphone, audio nodes and recognizer connection', async () => {
  const f = fixture({ command(session, text) { if (text === 'stop') session.stop(); } });
  await f.session.start(); f.ready();
  const processor = f.contexts[0].processor;
  f.emit('result', 'stop');
  assert.equal(f.session.active, false);
  assert.equal(f.track.stopped, true);
  assert.equal(f.contexts[0].closed, true);
  assert.equal(f.contexts[0].source.disconnected, true);
  assert.equal(processor.disconnected, true);
  assert.equal(processor.onaudioprocess, null);
  assert.equal(f.connections[0].closed, true);
  assert.equal(f.tasks.size, 0);
  f.emit('result', 'knight f three');
  assert.deepEqual(f.commands, ['stop']);
});

test('permission denial stops startup without retrying', async () => {
  const f = fixture({ getUserMedia: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } });
  await f.session.start();
  assert.equal(f.session.active, false);
  assert.match(f.states.at(-1)[1], /Allow the microphone/);
  assert.equal(f.connections[0].closed, true);
  assert.equal(f.contexts[0].closed, true);
  assert.equal(f.tasks.size, 0);
});

test('stopping during permission prompt releases a late stream and ignores old model events', async () => {
  let resolve;
  const f = fixture({ getUserMedia: () => new Promise(done => { resolve = done; }) });
  const started = f.session.start();
  f.session.stop();
  f.emit('loaded'); f.emit('ready');
  resolve(f.stream); await started;
  assert.equal(f.track.stopped, true);
  assert.equal(f.contexts[0].processor, undefined);
  assert.equal(f.session.active, false);
  assert.deepEqual(f.commands, []);
});

test('late callbacks cannot interrupt a newly started session', async () => {
  const f = fixture(); await f.session.start();
  const old = f.connections[0]; f.session.stop();
  await f.session.start(); f.ready();
  f.emit('error', '', f.session.epoch, old);
  f.emit('result', 'knight f three', f.session.epoch, old);
  assert.equal(f.session.active, true);
  assert.deepEqual(f.commands, []);
});

test('model load timeout, worker error and microphone removal release resources', async () => {
  for (const failure of ['timeout', 'error', 'track']) {
    const f = fixture(); await f.session.start();
    if (failure === 'timeout') [...f.tasks.values()][0]();
    if (failure === 'error') f.emit('error');
    if (failure === 'track') f.track.onended();
    assert.equal(f.session.active, false);
    assert.equal(f.track.stopped, true);
    assert.equal(f.contexts[0].closed, true);
    assert.equal(f.connections[0].closed, true);
    assert.equal(f.tasks.size, 0);
  }
  await settle();
});
