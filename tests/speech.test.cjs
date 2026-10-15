const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const Speech = load('speech.js', 'VoiceChessSpeech');

function fixture(Recognition, language, vocabularyOptions = {}) {
  const instances = [];
  const tasks = new Map();
  const states = [], transcripts = [], commands = [];
  const alternatives = [];
  const vocabularyStates = [];
  class FakeRecognition {
    constructor() { instances.push(this); this.processLocally = false; this.phrases = []; }
    start() { this.onstart(); }
    stop() { this.stopCalls = (this.stopCalls ?? 0) + 1; }
    abort() { this.aborted = true; this.onend(); }
  }
  if (vocabularyOptions.available) FakeRecognition.available = vocabularyOptions.available;
  if (vocabularyOptions.install) FakeRecognition.install = vocabularyOptions.install;
  const timers = {
    setTimeout(callback, delay) { const id = Symbol(); tasks.set(id, Object.assign(callback, { delay })); return id; },
    clearTimeout(id) { tasks.delete(id); },
  };
  const session = new Speech({
    Recognition: Recognition === undefined ? FakeRecognition : Recognition, language,
    Phrase: vocabularyOptions.Phrase, getPhrases: vocabularyOptions.getPhrases, onVocabulary: state => vocabularyStates.push(state),
    timers, onState: (...args) => states.push(args), onTranscript: text => transcripts.push(text),
    onCommand: (text, options) => { commands.push(text); alternatives.push(options); },
  });
  function emit(text, isFinal = true, resultIndex = 0, prior = []) {
    const result = [{ transcript: text }];
    result.isFinal = isFinal;
    instances.at(-1).onresult({ resultIndex, results: [...prior, result] });
  }
  function runTasks() { const callbacks = [...tasks.values()]; tasks.clear(); callbacks.forEach(callback => callback()); }
  return { session, instances, states, transcripts, commands, alternatives, vocabularyStates, tasks, emit, runTasks };
}

function vocabularyFixture(options = {}) {
  class Phrase { constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; } }
  return fixture(undefined, 'en-AU', { Phrase, available: async () => 'available', getPhrases: () => ['stop', 'knight f three'], ...options });
}
const settle = () => new Promise(resolve => setImmediate(resolve));

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

test('passes bounded final alternatives together, but displays only the leading interim transcript', () => {
  const f = fixture();
  f.session.start();
  assert.equal(f.instances[0].maxAlternatives, 5);
  const result = [' nice f tree ', ' knight f three ', 'knight f three', 'Nf3', 'night f3', 'e4']
    .map(transcript => ({ transcript }));
  result.isFinal = false;
  f.instances[0].onresult({ resultIndex: 0, results: [result] });
  assert.deepEqual(f.commands, []);
  assert.equal(f.transcripts.at(-1), 'nice f tree');
  result.isFinal = true;
  f.instances[0].onresult({ resultIndex: 0, results: [result] });
  assert.deepEqual(f.commands, ['nice f tree']);
  assert.deepEqual(Array.from(f.alternatives[0]), ['nice f tree', 'knight f three', 'Nf3', 'night f3']);
  f.instances[0].onresult({ resultIndex: 0, results: [result] });
  assert.equal(f.commands.length, 1);
});

test('uses the requested English locale and keeps it across reconnects', () => {
  const f = fixture(undefined, 'en-AU');
  f.session.start();
  assert.equal(f.instances[0].lang, 'en-AU');
  f.instances[0].onend();
  f.runTasks();
  assert.equal(f.instances[1].lang, 'en-AU');
  const fallback = fixture();
  fallback.session.start();
  assert.equal(fallback.instances[0].lang, 'en-US');
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

test('uses an already installed local model and refreshes equally boosted legal phrases', async () => {
  let phrases = ['stop', 'knight f three'];
  const f = vocabularyFixture({ getPhrases: () => phrases });
  f.session.start();
  await settle();
  const recognition = f.instances[0];
  assert.equal(recognition.processLocally, true);
  assert.match(f.states.at(-1)[1], /legal-move hints/);
  assert.deepEqual(Array.from(recognition.phrases, hint => hint.phrase), phrases);
  assert.ok(recognition.phrases.every(hint => hint.boost === 3));
  const original = recognition.phrases;
  f.session.refreshPhrases();
  assert.equal(recognition.phrases, original, 'Unchanged vocabulary should not be reset');
  phrases = ['stop', 'knight g five'];
  f.session.refreshPhrases();
  assert.deepEqual(Array.from(recognition.phrases, hint => hint.phrase), phrases);
  assert.deepEqual(f.commands, []);
});

test('downloadable models keep ordinary recognition working without an automatic download', async () => {
  let installs = 0;
  const f = vocabularyFixture({ available: async () => 'downloadable', install: async () => { installs++; return true; } });
  f.session.start();
  await settle();
  assert.equal(f.instances[0].processLocally, false);
  assert.equal(f.instances[0].phrases.length, 0);
  assert.equal(installs, 0);
  assert.equal(f.vocabularyStates.at(-1), 'downloadable');
  f.emit('Nf3');
  assert.deepEqual(f.commands, ['Nf3']);
});

test('an explicit model download releases the mic and requires another click to listen', async () => {
  let availability = 'downloadable';
  const requests = [];
  const f = vocabularyFixture({ available: async () => availability, install: async options => { requests.push(options); availability = 'available'; return true; } });
  f.session.start();
  await settle();
  await f.session.installVocabulary();
  assert.equal(f.instances[0].aborted, true);
  assert.equal(f.session.active, false);
  assert.equal(f.session.installing, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].langs[0], 'en-AU');
  assert.equal(requests[0].processLocally, true);
  assert.match(f.states.at(-1)[1], /Speech model ready/);
  assert.equal(f.instances.length, 1);
  f.session.start();
  await settle();
  assert.equal(f.instances[1].processLocally, true);
});

test('a failed model download leaves standard recognition available', async () => {
  const f = vocabularyFixture({ available: async () => 'downloadable', install: async () => { throw new Error('Download failed'); } });
  await f.session.installVocabulary();
  assert.equal(f.session.installing, false);
  assert.equal(f.vocabularyStates.at(-1), 'downloadable');
  assert.match(f.states.at(-1)[1], /standard recognition/);
  f.session.start();
  await settle();
  assert.equal(f.instances[0].processLocally, false);
});

test('model availability checks time out and ignore a late answer', async () => {
  let finish;
  const f = vocabularyFixture({ available: () => new Promise(resolve => { finish = resolve; }) });
  f.session.start();
  assert.equal([...f.tasks.values()][0].delay, 1000);
  f.runTasks();
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].processLocally, false);
  finish('available');
  await settle();
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].processLocally, false);
});

test('stopping or starting a new session discards an earlier availability result', async () => {
  const pending = [];
  const f = vocabularyFixture({ available: () => new Promise(resolve => pending.push(resolve)), install: async () => true });
  f.session.start();
  f.session.stop();
  assert.equal(f.tasks.size, 0);
  f.session.start();
  pending[0]('available');
  await settle();
  assert.equal(f.instances.length, 0);
  pending[1]('downloadable');
  await settle();
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].processLocally, false);
});

for (const error of ['phrases-not-supported', 'language-not-supported', 'service-not-allowed']) {
  test(`a local ${error} error falls back once, without replaying speech`, async () => {
    const f = vocabularyFixture();
    f.session.start();
    await settle();
    const old = f.instances[0];
    old.onerror({ error });
    assert.equal(old.aborted, true);
    assert.equal(f.session.active, true);
    assert.equal([...f.tasks.values()][0].delay, 300);
    f.emit('Nf3');
    assert.deepEqual(f.commands, []);
    f.runTasks();
    assert.equal(f.instances.length, 2);
    assert.equal(f.instances[1].processLocally, false);
    assert.equal(f.instances[1].phrases.length, 0);
    f.instances[1].onerror({ error });
    assert.equal(f.session.active, false);
    assert.equal(f.tasks.size, 0);
  });
}

test('stop cancels a pending hint fallback, and permission denial never falls back', async () => {
  const f = vocabularyFixture();
  f.session.start();
  await settle();
  f.instances[0].onerror({ error: 'phrases-not-supported' });
  f.session.stop();
  f.runTasks();
  assert.equal(f.instances.length, 1);
  const denied = vocabularyFixture();
  denied.session.start();
  await settle();
  denied.instances[0].onerror({ error: 'not-allowed' });
  assert.equal(denied.session.active, false);
  assert.equal(denied.tasks.size, 0);
});
