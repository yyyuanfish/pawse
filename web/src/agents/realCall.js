// Real phone calls through the backend (Twilio + Gradium + Gemini, see pawse/telephony.py).
// On the Twilio trial every call rings the team's verified demo line, never the chosen clinic.
import { PHONE_AGENT_URL } from '../config.js';

const base = () => PHONE_AGENT_URL || '';

/** { configured, demo_line } or null when the backend has no telephony. */
export async function callStatus(fetchImpl = globalThis.fetch) {
  try {
    const r = await fetchImpl(`${base()}/api/v1/calls/status`);
    const s = r.ok ? await r.json() : null;
    return s && s.configured ? s : null;
  } catch {
    return null;
  }
}

/** Places the call and streams its events ({type:'status'|'line'|'outcome'|'error'}) to onEvent. */
export async function startRealCall({ target, place, summary, voiceId }, onEvent, { fetchImpl = globalThis.fetch, EventSourceImpl = globalThis.EventSource } = {}) {
  const r = await fetchImpl(`${base()}/api/v1/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, place, summary, ...(voiceId ? { voice_id: voiceId } : {}), share_with_gemini: true, share_with_gradium: true, confirm_demo_line: true }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw Error(typeof j.detail === 'string' ? j.detail : `The call could not start (${r.status}).`);
  }
  const { id } = await r.json();
  const source = new EventSourceImpl(`${base()}/api/v1/calls/${encodeURIComponent(id)}/events`);
  let seen = -1; // events carry an index; a reconnect that replays old ones must not repeat them
  source.onmessage = (e) => {
    const n = Number(e.lastEventId);
    if (Number.isInteger(n) && e.lastEventId !== '') {
      if (n <= seen) return;
      seen = n;
    }
    let event;
    try {
      event = JSON.parse(e.data);
    } catch {
      return;
    }
    onEvent(event);
    if (event.type === 'status' && event.state === 'ended') source.close();
  };
  source.onerror = () => {
    if (source.readyState === 2) onEvent({ type: 'error', message: 'Lost the live call updates.' });
  };
  return {
    hangup: () => fetchImpl(`${base()}/api/v1/calls/${encodeURIComponent(id)}/hangup`, { method: 'POST' }).catch(() => {}),
    close: () => source.close(),
  };
}
