// Only the engine is simulated: extension frame, port bridge and page audio
// lifecycle are real. The separate Vosk smoke check uses the packaged decoder.
if (location.protocol === 'chrome-extension:') {
  window.fakeRecognizers = [];
  class Recognizer {
    constructor(rate, grammar) { this.sampleRate = rate; this.grammar = JSON.parse(grammar); this.listeners = {}; window.fakeRecognizers.push(this); }
    on(type, listener) { this.listeners[type] = listener; }
    setWords(enabled) { this.words = enabled; }
    emit(type, text, words = text.split(' ').map(word => ({ word, conf: 1 }))) {
      this.listeners[type]?.({ result: type === 'result' ? { text, result: this.words ? words : undefined } : { partial: text } });
    }
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
