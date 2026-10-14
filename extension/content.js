(() => {
  if (document.getElementById('voice-chess-control')) return;
  const isRush = () => /^\/puzzles\/rush\/?$/.test(location.pathname);
  const host = document.createElement('div');
  host.id = 'voice-chess-control';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; color-scheme: dark; }
      :host([hidden]) { display: none !important; }
      * { box-sizing: border-box; }
      .panel { width: 284px; max-height: var(--panel-height, calc(100vh - 40px)); overflow-y: auto; border: 1px solid #454642; border-radius: 14px; background: #242522; color: #f0f1eb; box-shadow: 0 6px 24px #0003; font: 13px/1.5 system-ui, sans-serif; scrollbar-width: thin; }
      .main { display: flex; align-items: center; gap: 12px; padding: 14px; }
      .copy { flex: 1; min-width: 0; }
      .title { font-size: 13px; font-weight: 650; letter-spacing: .1px; }
      .status { color: #aeb2a5; font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }
      button { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid #505348; border-radius: 50%; background: #34362f; color: #c8cdbb; cursor: pointer; }
      button:hover { background: #43473b; }
      button[aria-pressed="true"] { background: #c4dc97; border-color: #c4dc97; color: #242c18; }
      button:focus-visible, summary:focus-visible { outline: 2px solid #c4dc97; outline-offset: 4px; }
      svg { width: 19px; height: 19px; }
      .transcript { margin: 0 14px 12px; color: #dce5ce; font-size: 13px; overflow-wrap: anywhere; }
      .transcript:empty { display: none; }
      details { border-top: 1px solid #3d3f37; }
      summary { padding: 9px 14px; color: #aeb2a5; cursor: pointer; font-size: 11px; }
      .help { padding: 0 14px 13px; color: #bec3b5; font-size: 12px; }
      .help p { margin: 0 0 8px; }
      .examples { color: #f0f1eb; }
      .privacy { color: #969c8c; font-size: 11px; }
      @media (max-width: 400px) { :host { right: 12px; bottom: 12px; } .panel { width: 260px; } }
    </style>
    <section class="panel" aria-label="Voice Chess">
      <div class="main">
        <div class="copy"><div class="title">Voice Chess</div><div class="status" role="status" aria-live="polite">Microphone off</div></div>
        <button type="button" aria-label="Start listening" aria-pressed="false" title="Start listening">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>
        </button>
      </div>
      <div class="transcript"></div>
      <details><summary>How to speak a move</summary><div class="help">
        <p class="examples">“e two to e four”<br>“knight to f three”<br>“queen takes h seven”<br>“castle kingside”</p>
        <p>Say “stop” to turn the mic off. For clearer files, use alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel.</p>
        <p class="privacy">Your browser’s speech service may process audio online. Voice Chess saves no audio or transcripts.</p>
      </div></details>
    </section>`;
  document.documentElement.append(host);
  const status = root.querySelector('.status');
  const transcript = root.querySelector('.transcript');
  const toggle = root.querySelector('button');
  const help = root.querySelector('details');
  let busy = false;
  let lastSubmission = null;
  let sessionVersion = 0;
  let pendingCheck = null;

  const speech = new VoiceChessSpeech({
    Recognition: window.SpeechRecognition ?? window.webkitSpeechRecognition,
    onState(active, message) {
      toggle.setAttribute('aria-pressed', String(active));
      const label = active ? 'Stop listening' : 'Start listening';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      status.textContent = message;
      if (!active) {
        sessionVersion++;
        clearTimeout(pendingCheck);
        busy = false;
      }
    },
    onTranscript(text) { transcript.textContent = text; },
    onCommand(text) {
      if (!isRush() || document.hidden) return;
      const command = VoiceChessCommands.parse(text);
      if (command?.kind === 'stop') { speech.stop(); return; }
      if (command?.kind === 'help') { help.open = true; return; }
      if (busy) return;
      if (!command) { status.textContent = 'Try “e two to e four” or “knight f three”.'; return; }
      try {
        const position = VoiceChessBoard.snapshot();
        const result = VoiceChessCommands.resolve(command, position.moves);
        if (result.error) { status.textContent = result.error; return; }
        const move = result.move;
        const key = `${position.fen}:${move.from}${move.to}${move.promotion ?? ''}`;
        if (lastSubmission === key) { status.textContent = 'Already sent. Wait for the board to change.'; return; }
        busy = true;
        lastSubmission = key;
        const version = sessionVersion;
        let submissionError = false;
        try { VoiceChessBoard.play(position, move); } catch { submissionError = true; }
        status.textContent = `Sent ${move.from} → ${move.to}${move.promotion ? ' = ' + move.promotion.toUpperCase() : ''}`;
        // Some board versions throw after emitting a user move. Never resend it.
        pendingCheck = setTimeout(() => {
          busy = false;
          if (version !== sessionVersion) return;
          try {
            if (!position.element.isConnected || position.game.getFEN() !== position.fen) return;
          } catch { return; /* Board destroyed during a puzzle transition. */ }
          status.textContent = submissionError ? 'Board rejected the move. Use the mouse, then retry.' : 'Board did not change. Check the puzzle is running.';
        }, 600);
      } catch (error) {
        busy = false;
        status.textContent = error.message || 'Could not read this board.';
      }
    },
  });

  toggle.addEventListener('click', () => {
    if (speech.active) { speech.stop(); return; }
    if (!isRush()) return;
    try { VoiceChessBoard.snapshot(); } catch (error) { status.textContent = error.message; return; }
    transcript.textContent = '';
    lastSubmission = null;
    speech.start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && speech.active) speech.stop('Paused while this tab is hidden');
  });
  window.addEventListener('pagehide', () => speech.stop());
  // Chess.com can navigate without loading a new document. Hide and stop outside Rush.
  function placeControl() {
    const board = document.querySelector('wc-chess-board, chess-board');
    const bounds = board?.getBoundingClientRect();
    // Use the space below the board so the control doesn't cover Rush's buttons.
    if (bounds?.width > 0 && window.innerHeight - bounds.bottom >= 124) {
      host.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - 296))}px`;
      host.style.top = `${bounds.bottom + 12}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      host.style.setProperty('--panel-height', `${window.innerHeight - bounds.bottom - 24}px`);
    } else {
      host.style.left = '';
      host.style.top = '';
      host.style.right = '';
      host.style.bottom = '';
      host.style.removeProperty('--panel-height');
    }
  }
  function checkRoute() {
    host.hidden = !isRush();
    if (host.hidden && speech.active) speech.stop();
    if (!host.hidden) placeControl();
  }
  checkRoute();
  window.addEventListener('popstate', checkRoute);
  window.addEventListener('resize', placeControl);
  setInterval(checkRoute, 500);
})();
