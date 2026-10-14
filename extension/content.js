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
      :host([data-inline]) { position: static; display: block; width: fit-content; margin: 12px; }
      * { box-sizing: border-box; }
      .panel { width: min(284px, calc(100vw - 24px)); max-height: var(--panel-height, calc(100vh - 24px)); overflow-y: auto; border: 1px solid #454642; border-radius: 14px; background: #242522; color: #f0f1eb; box-shadow: 0 6px 24px #0003; font: 13px/1.5 system-ui, sans-serif; scrollbar-width: thin; }
      .main { display: flex; align-items: center; gap: 12px; padding: 14px; }
      .copy { flex: 1; min-width: 0; }
      .title { font-size: 13px; font-weight: 650; letter-spacing: .1px; }
      .status { color: #aeb2a5; font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }
      button { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid #505348; border-radius: 50%; background: #34362f; color: #c8cdbb; cursor: pointer; }
      button:hover { background: #43473b; }
      button[aria-pressed="true"] { background: #c4dc97; border-color: #c4dc97; color: #242c18; }
      button:focus-visible { outline: 2px solid #c4dc97; outline-offset: 4px; }
      svg { width: 19px; height: 19px; }
      .transcript { margin: 0 14px 12px; color: #dce5ce; font-size: 13px; overflow-wrap: anywhere; }
      .transcript:empty { display: none; }
      .privacy { margin: 0; padding: 0 14px 12px; color: #969c8c; font-size: 11px; }
      @media (max-width: 400px) { :host { right: 12px; bottom: 12px; } .panel { width: min(260px, calc(100vw - 24px)); } }
    </style>
    <section class="panel" aria-label="Voice Chess">
      <div class="main">
        <div class="copy"><div class="title">Voice Chess</div><div class="status" role="status" aria-live="polite">Microphone off</div></div>
        <button type="button" aria-label="Start listening" aria-pressed="false" title="Start listening">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>
        </button>
      </div>
      <div class="transcript"></div>
      <p class="privacy">Your browser may process speech online.</p>
    </section>`;
  // Stay outside Chess.com's body containers, which may clip or transform children.
  document.documentElement.append(host);
  const panel = root.querySelector('.panel');
  const status = root.querySelector('.status');
  const transcript = root.querySelector('.transcript');
  const toggle = root.querySelector('button');
  let waitingPosition = null;
  let submitting = false;
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
        pendingCheck = null;
        waitingPosition = null;
      }
    },
    onTranscript(text) { transcript.textContent = text; },
    onCommand(text) {
      if (!isRush() || document.hidden) return;
      const command = VoiceChessCommands.parse(text);
      if (command?.kind === 'stop') { speech.stop(); return; }
      if (submitting) return;
      if (!command) { status.textContent = 'Use standard notation: e4 or Nf3 (“knight f three”).'; return; }
      try {
        const position = VoiceChessBoard.snapshot();
        // Keep an unchanged position locked, but accept the next final command
        // as soon as the board has advanced instead of waiting for the watchdog.
        if (waitingPosition && waitingPosition.element === position.element && waitingPosition.game === position.game && waitingPosition.fen === position.fen) return;
        if (waitingPosition) {
          clearTimeout(pendingCheck);
          pendingCheck = null;
          waitingPosition = null;
        }
        const result = VoiceChessCommands.resolve(command, position.moves);
        if (result.error) { status.textContent = result.error; return; }
        const move = result.move;
        const key = `${position.fen}:${move.from}${move.to}${move.promotion ?? ''}`;
        if (lastSubmission === key) { status.textContent = 'Already sent. Wait for the board to change.'; return; }
        waitingPosition = position;
        const version = sessionVersion;
        let submission;
        submitting = true;
        try { submission = VoiceChessBoard.play(position, move); } catch (error) {
          waitingPosition = null;
          throw error;
        } finally { submitting = false; }
        lastSubmission = key;
        if (version !== sessionVersion) return;
        status.textContent = submission?.uncertain ? 'Could not confirm the move. Checking board…' : `Sent ${move.san}`;
        // Some board versions throw after emitting a user move. Never resend it.
        pendingCheck = setTimeout(() => {
          if (version !== sessionVersion) return;
          pendingCheck = null;
          waitingPosition = null;
          try {
            if (!position.element.isConnected) return;
            if (position.game.getFEN() !== position.fen) { status.textContent = `Sent ${move.san}`; return; }
          } catch { return; /* Board destroyed during a puzzle transition. */ }
          status.textContent = submission?.uncertain ? 'Board rejected the move. Use the mouse, then retry.' : 'Board did not change. Check the puzzle is running.';
        }, 600);
      } catch (error) {
        status.textContent = error.message || 'Could not read this board.';
      }
    },
  });

  toggle.addEventListener('click', () => {
    if (speech.active) { speech.stop(); return; }
    if (!isRush() || document.hidden) return;
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
    if (host.hidden) return;
    // Keep page-flow placement while scrolling to it. Switching to fixed would
    // shrink the document and jump back to the top before the panel is reached.
    if (host.hasAttribute('data-inline') && window.scrollY > 0) return;
    const board = VoiceChessBoard.findElement();
    const bounds = board?.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    const height = Math.min(panel.scrollHeight + 2, window.innerHeight - 24);
    const right = window.innerWidth - width - 12;
    const bottom = window.innerHeight - height - 12;
    const obstacles = Array.from(document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'))
      .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
    if (bounds) obstacles.push(bounds);
    const candidates = [];
    // Prefer space below the board, allowing long status messages to scroll if needed.
    const below = bounds ? window.innerHeight - bounds.bottom - 24 : 0;
    if (below >= Math.min(height, 124)) {
      candidates.push({ left: Math.max(12, Math.min(bounds.left, right)), top: bounds.bottom + 12, height: Math.min(height, below) });
    }
    // A fixed corner can remain reachable when the page itself cannot scroll.
    for (const [left, top] of [[right, bottom], [12, bottom], [right, 12], [12, 12]]) {
      candidates.push({ left, top, height });
    }
    const placement = candidates.find(candidate => candidate.left >= 12 && candidate.top >= 12 &&
      candidate.left + width <= window.innerWidth - 12 && candidate.top + candidate.height <= window.innerHeight - 12 &&
      !obstacles.some(rect => rect.left < candidate.left + width && rect.right > candidate.left && rect.top < candidate.top + candidate.height && rect.bottom > candidate.top));
    host.toggleAttribute('data-inline', Boolean(bounds) && !placement);
    if (placement) {
      host.style.left = `${placement.left}px`;
      host.style.top = `${placement.top}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      host.style.setProperty('--panel-height', `${placement.height}px`);
    }
    if (!placement) {
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
  window.navigation?.addEventListener('currententrychange', checkRoute);
  window.addEventListener('resize', placeControl);
  window.addEventListener('scroll', placeControl, { passive: true });
  new ResizeObserver(placeControl).observe(panel);
  setInterval(checkRoute, 500);
})();
