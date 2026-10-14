const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const Speech = load('speech.js', 'VoiceChessSpeech');

function fixture(Recognition) {
  const instances = [];
  const tasks = new Map();
  const states = [], transcripts = [], commands = [];
  class FakeRecognition {
    constructor() { instances.push(this); }
    start() { this.onstart(); }
    stop() { this.stopCalls = (this.stopCalls ?? 0) + 1; }
    abort() { this.aborted = true; this.onend(); }
  }
  const timers = {
    setTimeout(callback, delay) { const id = Symbol(); tasks.set(id, Object.assign(callback, { delay })); return id; },
    clearTimeout(id) { tasks.delete(id); },
  };
  const session = new Speech({
    Recognition: Recognition === undefined ? FakeRecognition : Recognition,
    timers, onState: (...args) => states.push(args), onTranscript: text => transcripts.push(text), onCommand: text => commands.push(text),
  });
  function emit(text, isFinal = true, resultIndex = 0, prior = []) {
    const result = [{ transcript: text }];
    result.isFinal = isFinal;
    instances.at(-1).onresult({ resultIndex, results: [...prior, result] });
  }
  function runTasks() { const callbacks = [...tasks.values()]; tasks.clear(); callbacks.forEach(callback => callback()); }
  return { session, instances, states, transcripts, commands, tasks, emit, runTasks };
}

test('starts only once and uses final results for moves', () => {
  const f = fixture();
  f.session.start();
  f.session.start();
  f.emit('e two', false);
  assert.equal(f.commands.length, 0);
  f.emit('e two to e four');
  assert.deepEqual(f.commands, ['e two to e four']);
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].continuous, false);
});

test('requests finalization when speech ends, but submits only the final result', () => {
  const f = fixture();
  f.session.start();
  f.emit('knight f three', false);
  assert.equal(f.instances[0].stopCalls, undefined);
  f.instances[0].onspeechend();
  f.instances[0].onspeechend();
  assert.equal(f.instances[0].stopCalls, 1);
  assert.deepEqual(f.commands, []);
  assert.equal(f.session.active, true);
  f.emit('knight f three');
  assert.deepEqual(f.commands, ['knight f three']);
});

test('rearms promptly after an utterance without overwriting the command status', () => {
  const f = fixture();
  f.session.start();
  f.emit('Nf3');
  const stateCount = f.states.length;
  f.instances[0].onend();
  assert.equal([...f.tasks.values()][0].delay, 50);
  f.runTasks();
  assert.equal(f.instances.length, 2);
  assert.equal(f.states.length, stateCount);
  assert.equal(f.session.failures, 0);
});

test('late speech-end events cannot finalize an earlier recognition object', () => {
  const f = fixture();
  f.session.start();
  const old = f.instances[0];
  f.session.stop();
  f.session.start();
  old.onspeechend();
  assert.equal(old.stopCalls, undefined);
  assert.equal(f.instances[1].stopCalls, undefined);
});

test('stop cancels rearming after a completed utterance', () => {
  const f = fixture();
  f.session.start();
  f.emit('Nf3');
  f.instances[0].onend();
  f.session.stop();
  f.runTasks();
  assert.equal(f.session.active, false);
  assert.equal(f.instances.length, 1);
});

test('a failed finalization stops listening without a retry loop', () => {
  const f = fixture();
  f.session.start();
  f.instances[0].stop = () => { throw new Error('Unavailable'); };
  f.instances[0].onspeechend();
  assert.equal(f.session.active, false);
  assert.equal(f.instances[0].aborted, true);
  assert.equal(f.tasks.size, 0);
});

test('does not replay previous final results', () => {
  const f = fixture();
  f.session.start();
  const old = [{ transcript: 'e2e4' }]; old.isFinal = true;
  f.emit('knight f3', true, 1, [old]);
  assert.deepEqual(f.commands, ['knight f3']);
});

test('delivers each final result index once, even when an event is repeated', () => {
  const f = fixture();
  f.session.start();
  f.emit('Nf3');
  f.emit('Nf3');
  assert.deepEqual(f.commands, ['Nf3']);
});

test('consumes additional finals in a batch without replaying them later', () => {
  const f = fixture();
  f.session.start();
  const results = ['Nf3', 'e4'].map(transcript => Object.assign([{ transcript }], { isFinal: true }));
  f.instances[0].onresult({ resultIndex: 0, results });
  f.instances[0].onresult({ resultIndex: 1, results });
  assert.deepEqual(f.commands, ['Nf3']);
  f.emit('e5', true, 2, results);
  assert.deepEqual(f.commands, ['Nf3', 'e5']);
});

test('result indexes restart for a new recognition object', () => {
  const f = fixture();
  f.session.start();
  f.emit('Nf3');
  f.instances[0].onend();
  f.runTasks();
  f.emit('e4');
  assert.deepEqual(f.commands, ['Nf3', 'e4']);
});

test('reconnects after normal disconnection', () => {
  const f = fixture();
  f.session.start();
  f.instances[0].onend();
  assert.equal(f.tasks.size, 1);
  assert.equal([...f.tasks.values()][0].delay, 300);
  f.runTasks();
  assert.equal(f.instances.length, 2);
  assert.equal(f.session.active, true);
});

test('stop cancels a scheduled restart and discards late results', () => {
  const f = fixture();
  f.session.start();
  const old = f.instances[0];
  old.onend();
  f.session.stop();
  f.runTasks();
  f.emit('e2e4');
  assert.equal(f.instances.length, 1);
  assert.equal(f.commands.length, 0);
  assert.equal(f.session.active, false);
});

test('new sessions ignore results from earlier recognition objects', () => {
  const f = fixture();
  f.session.start();
  const old = f.instances[0];
  f.session.stop();
  f.session.start();
  const result = [{ transcript: 'e2e4' }]; result.isFinal = true;
  old.onresult({ resultIndex: 0, results: [result] });
  assert.equal(f.commands.length, 0);
});

for (const error of ['not-allowed', 'audio-capture', 'network', 'service-not-allowed']) {
  test(`stops on ${error} without a retry loop`, () => {
    const f = fixture();
    f.session.start();
    f.instances[0].onerror({ error });
    assert.equal(f.session.active, false);
    assert.equal(f.tasks.size, 0);
    assert.equal(f.states.at(-1)[0], false);
    assert.notEqual(f.states.at(-1)[1], 'Microphone off');
  });
}

test('silence is recoverable but repeated disconnects eventually stop', () => {
  const f = fixture();
  f.session.start();
  f.instances[0].onerror({ error: 'no-speech' });
  assert.equal(f.session.active, true);
  for (let index = 0; index < 5; index++) { f.instances.at(-1).onend(); f.runTasks(); }
  assert.equal(f.session.active, false);
  assert.equal(f.instances.length, 5);
});

test('interim-only results do not allow endless reconnection', () => {
  const f = fixture();
  f.session.start();
  for (let index = 0; index < 5; index++) {
    f.emit('knight', false);
    f.instances.at(-1).onend();
    f.runTasks();
  }
  assert.equal(f.session.active, false);
  assert.equal(f.instances.length, 5);
  assert.deepEqual(f.commands, []);
});

test('a new final result resets the disconnect budget', () => {
  const f = fixture();
  f.session.start();
  for (let index = 0; index < 4; index++) { f.instances.at(-1).onend(); f.runTasks(); }
  f.emit('Nf3');
  f.instances.at(-1).onend();
  f.runTasks();
  assert.equal(f.session.active, true);
  assert.equal(f.instances.length, 6);
});

test('reports an unsupported speech API', () => {
  const f = fixture(null);
  f.session.start();
  assert.equal(f.session.active, false);
  assert.match(f.states.at(-1)[1], /Google Chrome/);
});

test('handles a synchronous speech start failure', () => {
  class BrokenRecognition { start() { throw new Error('denied'); } abort() {} }
  const f = fixture(BrokenRecognition);
  f.session.start();
  assert.equal(f.session.active, false);
  assert.match(f.states.at(-1)[1], /Could not start/);
});

test('handles a speech constructor failure without leaving the microphone active', () => {
  class BrokenRecognition { constructor() { throw new Error('unavailable'); } }
  const f = fixture(BrokenRecognition);
  f.session.start();
  assert.equal(f.session.active, false);
});
