// ISOLATED world: obtain the packaged URL without exposing extension APIs to
// the board adapter. Each frame receives only its session's transferred port.
(() => {
  let current = null;
  const isRush = () => /^\/puzzles\/rush\/?$/.test(location.pathname);
  const clear = () => { current?.frame.remove(); current = null; };
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const { type, session } = event.data ?? {};
    if (typeof session !== 'string' || !/^[a-f0-9-]{36}$/.test(session)) return;
    if (type === 'voice-chess-disconnect') { if (current?.session === session) clear(); return; }
    if (type !== 'voice-chess-connect' || !isRush() || document.hidden || event.ports.length !== 1) return;
    clear();
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.style.setProperty('display', 'none', 'important');
    frame.title = 'Voice Chess local recognizer';
    const url = chrome.runtime.getURL('recognizer.html');
    frame.src = url;
    current = { frame, session };
    frame.addEventListener('load', () => {
      if (current?.frame === frame) frame.contentWindow.postMessage({ type: 'voice-chess-recognizer' },
        new URL(url).origin, [event.ports[0]]);
    }, { once: true });
    document.documentElement.append(frame);
  });
  window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
})();
