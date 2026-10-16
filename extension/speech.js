// Audio stays on the puzzle page; PCM and vocabulary cross a private port.
const VoiceChessSpeech = class {
  constructor({ getVocabulary, onState, onTranscript, onCommand, acceptsQueue = () => false,
    getUserMedia = constraints => navigator.mediaDevices.getUserMedia(constraints),
    AudioContext = globalThis.AudioContext, connect = VoiceChessSpeech.connect,
    timers = globalThis }) {
    Object.assign(this, { getVocabulary, onState, onTranscript, onCommand, acceptsQueue, getUserMedia, AudioContext, connect, timers });
    this.active = false;
    this.version = 0;
    this.epoch = 0;
  }

  static connect() {
    const channel = new MessageChannel();
    const session = crypto.randomUUID();
    window.postMessage({ type: 'voice-chess-connect', session }, location.origin, [channel.port2]);
    return {
      port: channel.port1,
      close() {
        channel.port1.close();
        window.postMessage({ type: 'voice-chess-disconnect', session }, location.origin);
      },
    };
  }

  async start() {
    if (this.active) return;
    if (!this.AudioContext) { this.onState(false, 'Audio is unavailable. Use Google Chrome.'); return; }
    this.active = true;
    const version = ++this.version;
    this.onState(true, 'Loading bundled speech model…');
    this.timeout = this.timers.setTimeout(() => {
      if (this.version === version) this.stop('Speech model could not start. Click the mic to retry.');
    }, 60000);
    try {
      // Resume in the click handler, before waiting for permission or the model.
      const context = this.context = new this.AudioContext({ sampleRate: 16000 });
      const resumed = context.resume().then(() => true, () => false);
      this.connection = this.connect();
      this.connection.port.onmessage = event => {
        if (this.active && this.version === version) this.receive(event.data);
      };
      this.connection.port.start();
      const stream = await this.getUserMedia({ video: false, audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true,
      } });
      if (!this.active || this.version !== version) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      for (const track of stream.getAudioTracks()) {
        track.onended = () => { if (this.active && this.version === version) this.stop('Microphone disconnected. Click the mic to retry.'); };
      }
      if (!await resumed) throw new Error('Audio context could not resume');
      if (!this.active || this.version !== version) return;
      this.source = context.createMediaStreamSource(stream);
      // Silent output keeps Chromium scheduling without microphone playback.
      this.processor = context.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = event => {
        if (!this.active || this.version !== version) return;
        this.refreshVocabulary();
        if (!this.ready || this.readyEpoch !== this.epoch) return;
        try {
          const data = new Float32Array(event.inputBuffer.getChannelData(0));
          this.connection.port.postMessage({ type: 'audio', epoch: this.epoch, data }, [data.buffer]);
        } catch { this.stop('Audio processing failed. Click the mic to retry.'); }
      };
      this.source.connect(this.processor);
      this.processor.connect(context.destination);
      this.refreshVocabulary();
    } catch (error) {
      if (!this.active || this.version !== version) return;
      const messages = {
        NotAllowedError: 'Allow the microphone in Chess.com site settings, then retry.',
        NotFoundError: 'No microphone found. Connect one and retry.',
        NotReadableError: 'Microphone is busy or unavailable. Close other audio apps and retry.',
      };
      this.stop(messages[error?.name] ?? 'Could not start local speech. Click the mic to retry.');
    }
  }

  refreshVocabulary(force = false) {
    if (!this.active || !this.processor || !this.connection) return;
    try {
      const { key, phrases } = this.getVocabulary();
      if (!force && this.vocabularyKey === key) return;
      this.vocabularyKey = key;
      this.phrases = new Set(phrases);
      this.readyEpoch = null;
      this.connection.port.postMessage({ type: 'configure', epoch: ++this.epoch,
        sampleRate: this.context.sampleRate, phrases: [...this.phrases] });
    } catch { this.stop('Could not prepare the move vocabulary. Click the mic to retry.'); }
  }

  receive(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'error') { this.stop('Local recognition failed. Click the mic to retry.'); return; }
    if (message.type === 'loaded') { this.ready = true; return; }
    if (message.epoch !== this.epoch) return;
    this.refreshVocabulary();
    if (!this.active || message.epoch !== this.epoch) return;
    if (message.type === 'ready') {
      this.readyEpoch = this.epoch;
      this.timers.clearTimeout(this.timeout);
      this.timeout = null;
      if (!this.listening) { this.listening = true; this.onState(true, 'Listening · offline'); }
      return;
    }
    if (!['partial', 'result'].includes(message.type) || typeof message.text !== 'string' || message.text.length > 160) return;
    const text = message.text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!text) return;
    this.onTranscript(text);
    if (message.type !== 'result') return;
    // Vosk can recombine grammar words. Require a complete supplied phrase;
    // the parser then enforces legality and ambiguity against native SAN.
    if (!this.phrases.has(text) && !this.acceptsQueue(text)) this.onState(true, 'Unclear speech. Say one move again, or chain moves with “then”.');
    // A legal move cannot reveal a misheard file. Require confidence in each
    // commonly confused file token rather than substituting or guessing a move.
    else if (text.split(' ').some((word, index) => /^[acefg]$/.test(word) &&
      (!Array.isArray(message.words) || message.words[index]?.word !== word ||
        !Number.isFinite(message.words[index]?.conf) || message.words[index].conf < 0.8 || message.words[index].conf > 1))) {
      this.onState(true, 'Unclear file letter. Say the move again with a distinct file letter.');
    }
    else this.onCommand(text);
    // Consume one final per recognizer, discarding buffered and late speech.
    this.refreshVocabulary(true);
  }

  stop(message = 'Microphone off') {
    this.active = false;
    this.version++;
    this.ready = false;
    this.readyEpoch = null;
    this.listening = false;
    this.vocabularyKey = undefined;
    this.timers.clearTimeout(this.timeout);
    this.timeout = null;
    this.connection?.close();
    this.connection = null;
    if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); }
    this.processor = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.onState(false, message);
  }
};
