const VoiceChessSpeech = class {
  constructor({ Recognition, Phrase, getPhrases = () => [], onVocabulary = () => {}, language = 'en-US', onState, onTranscript, onCommand, timers = globalThis }) {
    this.Recognition = Recognition;
    this.Phrase = Phrase;
    this.getPhrases = getPhrases;
    this.onVocabulary = onVocabulary;
    this.language = language;
    this.onState = onState;
    this.onTranscript = onTranscript;
    this.onCommand = onCommand;
    this.timers = timers;
    this.active = false;
    this.recognition = null;
    this.restart = null;
    this.failures = 0;
    this.version = 0;
    this.preparing = null;
    this.installing = false;
    this.useLocal = false;
    this.hintKey = null;
    this.hintsEnabled = false;
  }

  start() {
    if (this.active || this.installing) return;
    if (!this.Recognition) {
      this.onState(false, 'Speech is unavailable. Use Google Chrome.');
      return;
    }
    this.active = true;
    this.failures = 0;
    this.useLocal = false;
    this.hintsEnabled = false;
    this.onState(true, 'Connecting microphone…');
    const version = ++this.version;
    if (typeof this.Phrase !== 'function' || typeof this.Recognition.available !== 'function') {
      this.onVocabulary('unavailable');
      this.listen();
      return;
    }
    let settled = false;
    const ready = availability => {
      if (settled || !this.active || this.version !== version) return;
      settled = true;
      this.timers.clearTimeout(this.preparing);
      this.preparing = null;
      this.useLocal = availability === 'available';
      this.hintsEnabled = this.useLocal;
      this.onVocabulary(typeof this.Recognition.install === 'function' || this.useLocal ? availability : 'unavailable');
      this.listen();
    };
    // Availability is optional; it must not leave microphone startup hanging.
    this.preparing = this.timers.setTimeout(() => ready('unavailable'), 1000);
    try {
      Promise.resolve(this.Recognition.available({ langs: [this.language], processLocally: true })).then(ready, () => ready('unavailable'));
    } catch { ready('unavailable'); }
  }

  async installVocabulary() {
    if (this.installing || typeof this.Phrase !== 'function' || typeof this.Recognition?.install !== 'function') return;
    this.installing = true;
    this.stop('Downloading speech model…');
    this.onVocabulary('downloading');
    let installed = false;
    try { installed = await this.Recognition.install({ langs: [this.language], processLocally: true }); } catch { /* Standard recognition remains available. */ }
    this.installing = false;
    this.onVocabulary(installed ? 'available' : 'downloadable');
    this.onState(false, installed ? 'Speech model ready. Click the mic to use move hints.' : 'Download failed. You can still use standard recognition.');
  }

  refreshPhrases() {
    const recognition = this.recognition;
    if (!this.active || !recognition || !this.hintsEnabled || !('phrases' in recognition)) return;
    try {
      const phrases = [...new Set(this.getPhrases().filter(phrase => typeof phrase === 'string' && phrase.length <= 160))];
      const key = JSON.stringify(phrases);
      if (key === this.hintKey) return;
      recognition.phrases = phrases.map(phrase => new this.Phrase(phrase, 3));
      this.hintKey = key;
    } catch {
      this.hintsEnabled = false;
      this.hintKey = null;
      try { recognition.phrases = []; } catch { /* This service cannot use hints. */ }
    }
  }

  listen(preserveStatus = false) {
    if (!this.active) return;
    let recognition;
    try { recognition = new this.Recognition(); } catch {
      this.stop('Could not start speech. Click the microphone to retry.');
      return;
    }
    this.recognition = recognition;
    recognition.lang = this.language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    if (this.useLocal && 'processLocally' in recognition) recognition.processLocally = true;
    this.hintKey = null;
    this.refreshPhrases();
    let finalizedThrough = -1;
    let finishing = false;
    let receivedFinal = false;
    recognition.onstart = () => {
      if (this.active && this.recognition === recognition && !preserveStatus) this.onState(true, this.hintKey ? 'Listening · legal-move hints' : 'Listening');
    };
    recognition.onspeechend = () => {
      if (!this.active || this.recognition !== recognition || finishing) return;
      finishing = true;
      if (!receivedFinal) this.onState(true, 'Recognizing…');
      // stop() asks the browser to finalize captured speech; it does not submit
      // the interim transcript. Keep the mic control armed for the next utterance.
      try { recognition.stop(); } catch {
        this.stop('Could not finish speech. Click the microphone to retry.');
      }
    };
    recognition.onresult = event => {
      if (!this.active || this.recognition !== recognition) return;
      let command = null;
      let interim = null;
      for (let index = Math.max(event.resultIndex, finalizedThrough + 1); index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal) {
          finalizedThrough = index;
          const alternatives = [...new Set(Array.from({ length: Math.min(result.length, 5) }, (_, option) => result[option]?.transcript)
            .filter(text => typeof text === 'string').map(text => text.trim()).filter(Boolean))];
          if (command === null && alternatives.length) command = alternatives;
        } else interim = result[0]?.transcript?.trim() ?? '';
      }
      // Final results are immutable and accumulate for this recognition object.
      // Consume the entire batch before delivering one command, so ignored finals
      // cannot be replayed against a later puzzle position.
      if (command !== null) {
        receivedFinal = true;
        this.failures = 0;
        this.onTranscript(command[0]);
        this.onCommand(command[0], command);
        this.refreshPhrases();
      } else if (interim !== null) {
        this.onTranscript(interim);
      }
    };
    recognition.onerror = event => {
      if (!this.active || this.recognition !== recognition) return;
      if (event.error === 'no-speech') return;
      if (this.useLocal && !receivedFinal && ['phrases-not-supported', 'language-not-supported', 'service-not-allowed'].includes(event.error)) {
        // Retry with ordinary recognition once, without retaining any utterance.
        // Clearing the local flag prevents another fallback loop this session.
        this.useLocal = false;
        this.hintsEnabled = false;
        this.recognition = null;
        try { recognition.abort(); } catch { /* Already ended. */ }
        this.onState(true, 'Using standard recognition. Say your move again.');
        this.restart = this.timers.setTimeout(() => { this.restart = null; this.listen(); }, 300);
        return;
      }
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
      if (!receivedFinal && ++this.failures >= 5) {
        this.stop('Speech keeps disconnecting. Click the microphone to retry.');
        return;
      }
      if (!receivedFinal) this.onState(true, 'Reconnecting microphone…');
      this.restart = this.timers.setTimeout(() => {
        this.restart = null;
        this.listen(receivedFinal);
      }, receivedFinal ? 50 : 300);
    };
    try {
      recognition.start();
    } catch {
      this.stop('Could not start speech. Click the microphone to retry.');
    }
  }

  stop(message = 'Microphone off') {
    this.active = false;
    this.version++;
    this.timers.clearTimeout(this.preparing);
    this.preparing = null;
    this.timers.clearTimeout(this.restart);
    this.restart = null;
    const recognition = this.recognition;
    this.recognition = null;
    this.hintKey = null;
    try { recognition?.abort(); } catch { /* Already ended. */ }
    this.onState(false, message);
  }
};
