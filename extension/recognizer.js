// Extension origin: packaged Vosk worker and WASM use the extension's CSP.
(() => {
  let connected = false;
  window.addEventListener('message', event => {
    if (connected || event.source !== parent || event.origin !== 'https://www.chess.com' ||
      event.data?.type !== 'voice-chess-recognizer' || event.ports.length !== 1) return;
    connected = true;
    const port = event.ports[0];
    let model, recognizer, configuration, epoch, pending = 0;
    let audio = [], samples = 0, replay = null, busy = false, consumed = false;
    const fail = () => port.postMessage({ type: 'error' });
    const validPhrases = phrases => Array.isArray(phrases) && phrases.length > 0 && phrases.length <= 4096 &&
      phrases.every(phrase => typeof phrase === 'string' && phrase.length <= 160 && /^[a-z]+(?: [a-z]+)*$/.test(phrase));
    const pump = () => {
      if (consumed || busy || !replay?.length) return;
      const data = replay.shift();
      samples -= data.length;
      busy = true;
      try { recognizer.acceptWaveformFloat(data, configuration.sampleRate); } catch { fail(); }
    };
    const listen = (phrases, marker) => {
      recognizer?.remove();
      const current = recognizer = new model.KaldiRecognizer(configuration.sampleRate, JSON.stringify([...phrases, '[unk]']));
      current.setWords(true);
      const currentEpoch = epoch;
      current.on('result', message => {
        if (recognizer !== current || consumed) return;
        pending = Math.max(0, pending - 1);
        busy = false;
        const result = message.result;
        const text = result?.text ?? '';
        if (typeof text !== 'string') { fail(); return; }
        if (!text.trim()) {
          if (replay) pump();
          else {
            audio = pending > 0 && audio ? audio.slice(-pending) : [];
            samples = audio.reduce((total, chunk) => total + chunk.length, 0);
          }
          return;
        }
        if (!marker && configuration.queuePhrases && (/\bthen\b/.test(text) || /^(queue|premove)\b/.test(text))) {
          // Preserve the whole utterance before accepting any part of a chain.
          // Audio is bounded, kept only in memory, and discarded after the final.
          if (audio?.length) {
            replay = audio;
            audio = [];
            pending = 0;
            try {
              listen(configuration.queuePhrases, { chain: /\bthen\b/.test(text), prefix: /^(queue|premove)\b/.test(text) });
              pump();
            } catch { fail(); }
            return;
          }
          consumed = true;
          audio = []; samples = 0;
          port.postMessage({ type: 'result', epoch: currentEpoch, text: '[unk]' });
          return;
        }
        // A broad decode must retain the detected chain/prefix. Never execute
        // just its first move if the rest was lost during recognition.
        const intact = !marker || ((!marker.chain || /\bthen\b/.test(text)) && (!marker.prefix || /^(queue|premove)\b/.test(text)));
        consumed = true;
        audio = []; replay = null; samples = 0;
        port.postMessage({ type: 'result', epoch: currentEpoch, text: intact && text.length <= 160 ? text : '[unk]', words: result?.result });
      });
      current.on('partialresult', message => {
        if (recognizer !== current || consumed) return;
        pending = Math.max(0, pending - 1);
        busy = false;
        port.postMessage({ type: 'partial', epoch: currentEpoch, text: message.result?.partial ?? '' });
        pump();
      });
      current.on('error', () => { if (recognizer === current && !consumed) fail(); });
    };
    const configure = () => {
      if (!model?.ready || !configuration) return;
      try {
        epoch = configuration.epoch;
        pending = 0;
        audio = []; replay = null; samples = 0; busy = false; consumed = false;
        listen(configuration.phrases);
        port.postMessage({ type: 'ready', epoch });
      } catch { fail(); }
    };
    port.onmessage = ({ data }) => {
      if (data?.type === 'configure') {
        if (!Number.isSafeInteger(data.epoch) || data.epoch < 1 ||
          !Number.isFinite(data.sampleRate) || data.sampleRate < 8000 || data.sampleRate > 96000 ||
          !validPhrases(data.phrases) || (data.queuePhrases !== undefined && !validPhrases(data.queuePhrases))) { fail(); return; }
        if (configuration && data.epoch <= configuration.epoch) return;
        configuration = data;
        configure();
      } else if (data?.type === 'audio' && recognizer && data.epoch === epoch && !consumed) {
        if (!(data.data instanceof Float32Array) || !data.data.length || data.data.length > 8192 ||
          !data.data.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1)) { fail(); return; }
        samples += data.data.length;
        if (replay) {
          if (samples > configuration.sampleRate * 20) { fail(); return; }
          replay.push(data.data);
          pump();
        } else {
          if (samples > configuration.sampleRate * 20) audio = null;
          audio?.push(data.data);
          if (++pending > 16) { fail(); return; }
          try { recognizer.acceptWaveformFloat(data.data, configuration.sampleRate); } catch { fail(); }
        }
      }
    };
    port.start();
    try {
      model = new Vosk.Model(new URL('vendor/model-en-us-0.15.tar.gz', location.href).href, -1);
      model.on('error', fail);
      model.worker.addEventListener('error', fail);
      model.on('load', message => {
        if (!message.result) { fail(); return; }
        port.postMessage({ type: 'loaded' });
        configure();
      });
    } catch { fail(); }
    // Destroy the worker even when a model load has not finished yet.
    window.addEventListener('pagehide', () => { port.close(); model?.worker.terminate(); });
  });
})();
