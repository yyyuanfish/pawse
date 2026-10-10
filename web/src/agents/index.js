import { VOICE_AGENT, CLINIC_SEARCH, PHONE_AGENT, MOCK_SPEED } from '../config.js';
import { createMockVoiceAgent } from './mockVoiceAgent.js';
import { createGeminiLiveAgent } from './geminiLiveAgent.js';
import { createFallbackVoiceAgent } from './fallbackVoiceAgent.js';
import { createLiveVoiceAgent } from './liveVoiceAgent.js';
import { mockSearchClinics } from './mockClinicSearch.js';
import { liveSearchClinics } from './liveClinicSearch.js';
import { createMockPhoneCall } from './mockPhoneAgent.js';
import { createLivePhoneCall } from './livePhoneAgent.js';

export const IS_LIVE_VOICE = VOICE_AGENT === 'live';
export const IS_LIVE_CLINICS = CLINIC_SEARCH === 'live';
export const IS_LIVE_PHONE = PHONE_AGENT === 'live';
export const IS_MOCK = !IS_LIVE_VOICE || !IS_LIVE_CLINICS || !IS_LIVE_PHONE;
// ?debug=1 shows raw agent traces (e.g. the voice call's "Agent results" box); off for owners.
export const DEBUG = new URLSearchParams(globalThis.location?.search || '').get('debug') === '1';

/** Which voice path runs: 'mock' (scripted), 'rest' (transcribe + care over REST) or 'native' (Gemini Live audio). */
export const VOICE_PATH = !IS_LIVE_VOICE ? 'mock' : new URLSearchParams(globalThis.location?.search || '').get('voice') === 'rest' ? 'rest' : 'native';

/** The page opens the microphone only if the active voice agent wants audio. */
export const VOICE_WANTS_AUDIO = IS_LIVE_VOICE;

/** 1. Voice conversation with Pawse. */
export function createVoiceAgent(opts) {
  if (!IS_LIVE_VOICE) return createMockVoiceAgent({ speed: MOCK_SPEED, ...opts });
  if (VOICE_PATH === 'rest') return createLiveVoiceAgent(opts);
  // Gemini Live, or the simulated rehearsal (with a visible notice) if Live cannot start.
  return createFallbackVoiceAgent({ makeLive: onStartFailed => createGeminiLiveAgent({ ...opts, onStartFailed }), makeMock: () => createMockVoiceAgent({ speed: MOCK_SPEED, ...opts }) });
}

/** 2. Nearby vet clinics. */
export function searchClinics(opts) {
  return IS_LIVE_CLINICS ? liveSearchClinics(opts) : mockSearchClinics({ speed: MOCK_SPEED, ...opts });
}

/** 3. Pawse calls the clinic or the insurer. */
export function createPhoneCall(opts) {
  return IS_LIVE_PHONE ? createLivePhoneCall(opts) : createMockPhoneCall({ speed: MOCK_SPEED, ...opts });
}
