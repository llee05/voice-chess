const VoiceChessSpeech = class {
  constructor({ Recognition, language = 'en-US', onState, onTranscript, onCommand, timers = globalThis }) {
    this.Recognition = Recognition;
    this.language = language;
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
    let finalizedThrough = -1;
    let finishing = false;
    let receivedFinal = false;
    recognition.onstart = () => {
      if (this.active && this.recognition === recognition && !preserveStatus) this.onState(true, 'Listening');
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
      } else if (interim !== null) {
        this.onTranscript(interim);
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
    this.timers.clearTimeout(this.restart);
    this.restart = null;
    const recognition = this.recognition;
    this.recognition = null;
    try { recognition?.abort(); } catch { /* Already ended. */ }
    this.onState(false, message);
  }
};
