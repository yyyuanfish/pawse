// Reviewed communication and evidence tools. These endpoints do not place calls.
import { PHONE_AGENT_URL } from '../config.js';
export async function requestTool(path, body, { binary = false, signal } = {}) {
  const response = await fetch(`${PHONE_AGENT_URL || ''}/api/v1/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`);
  }
  return binary ? response.blob() : response.json();
}
export function draftHandoff(message, lang, target, consent, signal) {
  if (!consent) return Promise.reject(new Error('Confirm sharing with Gemini.'));
  return requestTool('voice/scripts', { message, input_language: lang, subtitle_language: lang,
    target_language: 'de', recipient: target === 'insurance' ? 'insurer' : 'vet', share_with_gemini: true }, { signal });
}
/** The whole demo policy as cited sections (no search; local, no provider call, no owner data sent). */
export async function loadDemoPolicy(signal) {
  const response = await fetch(`${PHONE_AGENT_URL || ''}/api/v1/knowledge/evidence`, { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}
export function generateSpeech(text, voice, consent, signal) {
  if (!consent) return Promise.reject(new Error('Confirm sharing the reviewed script with Gradium.'));
  return requestTool('voice/speech', { text, language: 'de', voice, share_with_gradium: true }, { binary: true, signal });
}
/** Default speech voice: the owner's own German voice only when one is ready, else the standard voice. */
export function initialVoice(context) {
  return context && context.voice === 'my_voice' ? 'my_voice' : 'standard';
}
/** What a prepared conversation hands back to the plan: a script (and maybe audio), never a call result. */
export function preparedResult(target, script, audio) {
  return { prepared: true, target, lines: script ? script.lines.length : 0, audio: !!audio };
}
