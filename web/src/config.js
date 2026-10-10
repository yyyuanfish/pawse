// Central switches. Set them in .env.local (see .env.example).
// import.meta.env is undefined outside Vite (e.g. plain-Node checks), so guard it.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const param = (k) => {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
};

/** 'live' = the Pawse backend (default). 'mock' = scripted rehearsal, on request only: "?demo=1" switches all three at runtime. */
const DEMO_ALL = param('demo') === '1';
const LIVE_ALL = !DEMO_ALL && param('live') === '1';
export const VOICE_AGENT = DEMO_ALL ? 'mock' : LIVE_ALL ? 'live' : env.VITE_VOICE_AGENT || 'live';
export const CLINIC_SEARCH = DEMO_ALL ? 'mock' : LIVE_ALL ? 'live' : env.VITE_CLINIC_SEARCH || 'live';
export const PHONE_AGENT = DEMO_ALL ? 'mock' : LIVE_ALL ? 'live' : env.VITE_PHONE_AGENT || 'live';

export const VOICE_AGENT_URL = env.VITE_VOICE_AGENT_URL || '';
export const CLINIC_SEARCH_URL = env.VITE_CLINIC_SEARCH_URL || '';
export const PHONE_AGENT_URL = env.VITE_PHONE_AGENT_URL || '';

/** Mock playback speed. "?speed=3" in the URL plays the demo 3x faster (handy for rehearsing). */
export const MOCK_SPEED = (() => {
  const v = Number(param('speed'));
  return v > 0 ? v : 1;
})();
