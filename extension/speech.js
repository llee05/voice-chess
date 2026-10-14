const VoiceChessSpeech = class {
  constructor({ Recognition, onState, onTranscript, onCommand, timers = globalThis }) {
    this.Recognition = Recognition;
    this.onState = onState;
    this.onTranscript = onTranscript;
    this.onCommand = onCommand;
    this.timers = timers;
    this.active = false;
    this.recognition = null;
    this.restart = null;
    this.failures = 0;
  }

  start() {
    if (this.active) return;
    if (!this.Recognition) {
      this.onState(false, 'Speech is unavailable. Use Google Chrome.');
      return;
    }
    this.active = true;
    this.failures = 0;
    this.onState(true, 'Connecting microphone…');
    this.listen();
  }

  listen() {
    if (!this.active) return;
    let recognition;
    try { recognition = new this.Recognition(); } catch {
      this.stop('Could not start speech. Click the microphone to retry.');
      return;
    }
    this.recognition = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (this.active && this.recognition === recognition) this.onState(true, 'Listening');
    };
    recognition.onresult = event => {
      if (!this.active || this.recognition !== recognition) return;
      this.failures = 0;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        this.onTranscript(text);
        if (result.isFinal) {
          this.onCommand(text);
          // Submit only one command from a recognition batch; later results could
          // belong to the previous position or contain a second accidental move.
          break;
        }
      }
    };
    recognition.onerror = event => {
      if (!this.active || this.recognition !== recognition) return;
      if (event.error === 'no-speech') return;
      const messages = {
        'not-allowed': 'Allow the microphone in Chess.com site settings, then retry.',
        'service-not-allowed': 'Speech service unavailable. Try Google Chrome.',
        'audio-capture': 'No microphone found. Connect one and retry.',
        network: 'Speech connection failed. Check your internet and retry.',
        'language-not-supported': 'English speech recognition is unavailable.',
      };
      this.stop(messages[event.error] ?? 'Speech stopped. Click the microphone to retry.');
    };
    recognition.onend = () => {
      if (!this.active || this.recognition !== recognition) return;
      this.recognition = null;
      if (++this.failures >= 5) {
        this.stop('Speech keeps disconnecting. Click the microphone to retry.');
        return;
      }
      this.onState(true, 'Reconnecting microphone…');
      this.restart = this.timers.setTimeout(() => {
        this.restart = null;
        this.listen();
      }, 300);
    };
    try {
      recognition.start();
    } catch {
      this.stop('Could not start speech. Click the microphone to retry.');
    }
  }

  stop(message = 'Microphone off') {
    this.active = false;
    this.timers.clearTimeout(this.restart);
    this.restart = null;
    const recognition = this.recognition;
    this.recognition = null;
    try { recognition?.abort(); } catch { /* Already ended. */ }
    this.onState(false, message);
  }
};
