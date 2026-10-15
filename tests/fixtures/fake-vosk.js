// Only the engine is simulated: extension frame, port bridge and page audio
// lifecycle are real. The separate Vosk smoke check uses the packaged decoder.
if (location.protocol === 'chrome-extension:') {
  window.fakeRecognizers = [];
  class Recognizer {
    constructor(rate, grammar) { this.sampleRate = rate; this.grammar = JSON.parse(grammar); this.listeners = {}; window.fakeRecognizers.push(this); }
    on(type, listener) { this.listeners[type] = listener; }
    emit(type, text) { this.listeners[type]?.({ result: type === 'result' ? { text } : { partial: text } }); }
    remove() { this.removed = true; }
    acceptWaveformFloat() {}
  }
  const fake = { Model: class {
    constructor() { this.ready = true; this.worker = { addEventListener() {}, terminate() {} }; }
    on(type, listener) { if (type === 'load') queueMicrotask(() => listener({ result: true })); }
    get KaldiRecognizer() { return Recognizer; }
  } };
  Object.defineProperty(window, 'Vosk', { get: () => fake, set() {} });
}
