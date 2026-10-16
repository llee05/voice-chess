// Extension origin: packaged Vosk worker and WASM use the extension's CSP.
(() => {
  let connected = false;
  window.addEventListener('message', event => {
    if (connected || event.source !== parent || event.origin !== 'https://www.chess.com' ||
      event.data?.type !== 'voice-chess-recognizer' || event.ports.length !== 1) return;
    connected = true;
    const port = event.ports[0];
    let model, recognizer, configuration, epoch, pending = 0;
    let consumed = false;
    const fail = () => port.postMessage({ type: 'error' });
    const validPhrases = phrases => Array.isArray(phrases) && phrases.length > 0 && phrases.length <= 4096 &&
      phrases.every(phrase => typeof phrase === 'string' && phrase.length <= 160 && /^[a-z]+(?: [a-z]+)*$/.test(phrase));
    const listen = phrases => {
      recognizer?.remove();
      const current = recognizer = new model.KaldiRecognizer(configuration.sampleRate, JSON.stringify([...phrases, '[unk]']));
      current.setWords(true);
      const currentEpoch = epoch;
      current.on('result', message => {
        if (recognizer !== current || consumed) return;
        pending = Math.max(0, pending - 1);
        const result = message.result;
        const text = result?.text ?? '';
        if (typeof text !== 'string') { fail(); return; }
        if (!text.trim()) return;
        consumed = true;
        port.postMessage({ type: 'result', epoch: currentEpoch, text: text.length <= 160 ? text : '[unk]', words: result?.result });
      });
      current.on('partialresult', message => {
        if (recognizer !== current || consumed) return;
        pending = Math.max(0, pending - 1);
        port.postMessage({ type: 'partial', epoch: currentEpoch, text: message.result?.partial ?? '' });
      });
      current.on('error', () => { if (recognizer === current && !consumed) fail(); });
    };
    const configure = () => {
      if (!model?.ready || !configuration) return;
      try {
        epoch = configuration.epoch;
        pending = 0;
        consumed = false;
        listen(configuration.phrases);
        port.postMessage({ type: 'ready', epoch });
      } catch { fail(); }
    };
    port.onmessage = ({ data }) => {
      if (data?.type === 'configure') {
        if (!Number.isSafeInteger(data.epoch) || data.epoch < 1 ||
          !Number.isFinite(data.sampleRate) || data.sampleRate < 8000 || data.sampleRate > 96000 ||
          !validPhrases(data.phrases)) { fail(); return; }
        if (configuration && data.epoch <= configuration.epoch) return;
        configuration = data;
        configure();
      } else if (data?.type === 'audio' && recognizer && data.epoch === epoch && !consumed) {
        if (!(data.data instanceof Float32Array) || !data.data.length || data.data.length > 8192 ||
          !data.data.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1)) { fail(); return; }
        if (++pending > 16) { fail(); return; }
        try { recognizer.acceptWaveformFloat(data.data, configuration.sampleRate); } catch { fail(); }
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
