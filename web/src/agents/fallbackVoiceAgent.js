// Gemini Live with a safety net: if Live cannot start (token 503/502/429/422, socket error) the call switches to the
// scripted rehearsal and says so on screen. Failures after the session connected keep Live's own error-and-end path.
export const FALLBACK_NOTICE = 'Live voice is unavailable right now, so this is the simulated rehearsal.';

export function createFallbackVoiceAgent({ makeLive, makeMock, notice = FALLBACK_NOTICE }) {
  const listeners = new Set();
  let cur, ended = false, media = null, micMuted = true, outMuted = false, switched = false;
  const fan = e => { for (const fn of listeners) { try { fn(e); } catch {} } };
  const wire = a => { a.on(fan); return a; };
  cur = wire(makeLive(() => { if (!ended) fallback(); }));
  function fallback() {
    switched = true;
    cur = wire(makeMock());
    cur.setMicMuted?.(micMuted); cur.setOutputMuted?.(outMuted);
    if (media) cur.attachMedia?.(media);
    fan({ type: 'fallback' }); // the page closes the mic: the rehearsal does not listen
    fan({ type: 'error', message: notice });
    cur.start();
  }
  return {
    get wantsAudio() { return !!cur.wantsAudio; },
    get simulated() { return switched; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start: () => cur.start(),
    end() { if (ended) return; ended = true; cur.end(); },
    sendText: t => cur.sendText(t),
    sendImage: f => cur.sendImage?.(f),
    attachMedia(m) { media = m; cur.attachMedia?.(m); },
    setMicMuted(v) { micMuted = !!v; cur.setMicMuted?.(v); },
    setOutputMuted(v) { outMuted = !!v; cur.setOutputMuted?.(v); },
  };
}
