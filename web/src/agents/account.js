// Simple accounts and history (pawse/accounts.py): a guest by default, username + password to keep
// the history across devices. The session lives in an HttpOnly cookie.
import { VOICE_AGENT_URL } from '../config.js';

const base = () => VOICE_AGENT_URL || '';

async function call(path, body) {
  const r = await fetch(`${base()}/api/v1/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(typeof j.detail === 'string' ? j.detail : 'Check the username (3+ letters/digits) and password (6+ characters).');
  return j;
}

export const me = () => call('me');
export const register = (username, password) => call('auth/register', { username, password });
export const login = (username, password) => call('auth/login', { username, password });
export const logout = () => call('auth/logout', {});
export const history = () => call('history').then((j) => j.items || []);
/** Saves a care assessment to the owner's history; failures never interrupt the call. */
export const saveAssessment = (triage) =>
  call('history', { kind: 'assessment', title: String(triage.headline || 'Care assessment').slice(0, 200), detail: { level: triage.level, summary: String(triage.summary || '').slice(0, 2000) } }).catch(() => {});
