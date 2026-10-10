import { useEffect, useState } from 'react';
import OwnVoice from './pages/OwnVoice.jsx';
import Home from './pages/Home.jsx';
import VoiceCall from './pages/VoiceCall.jsx';
import ClinicList from './pages/ClinicList.jsx';
import LiveHandoff from './pages/LiveHandoff.jsx';
import PhoneCall from './pages/PhoneCall.jsx';
import Plan from './pages/Plan.jsx';
import History from './pages/History.jsx';
import Welcome from './pages/Welcome.jsx';
import { me } from './agents/account.js';
import { strings, detectLang, saveLang } from './i18n.js';
import { primeSpeech } from './agents/speech.js';
import { buildSummary } from './utils/summary.js';
import { stepState } from './utils/steps.js';
import StepRail from './components/StepRail.jsx';
import { IS_LIVE_PHONE, IS_MOCK } from './agents/index.js';
import { PHONE_AGENT_URL } from './config.js';
import { watchLocation } from './agents/location.js';

const GRADIUM_KEY = 'pawse.gradium';
const GUEST_KEY = 'pawse.guest';
function loadGradiumChoice() {
  try {
    return localStorage.getItem(GRADIUM_KEY) !== '0'; // on by default, the owner can turn it off
  } catch {
    return true;
  }
}

// home → voice call with Pawse → advice
//   → "call the vet": clinic list → Pawse calls the chosen clinic
//   → "call the insurer": Pawse calls the insurer
//   → plan (summary)
export default function App() {
  const [view, setView] = useState('home'); // welcome | home | voice | clinics | phone | plan | history
  // Live app: the first open asks to sign in; "Continue as guest" is remembered in this browser.
  useEffect(() => {
    let guest = false;
    try {
      guest = localStorage.getItem(GUEST_KEY) === '1';
    } catch { /* storage unavailable */ }
    if (IS_MOCK || guest) return undefined;
    let alive = true;
    me().then((m) => alive && !m.signed_in && setView((v) => (v === 'home' ? 'welcome' : v))).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [lang, setLangState] = useState(detectLang);
  const [triage, setTriage] = useState(null);
  const [vet, setVet] = useState(null);
  const [insurance, setInsurance] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [target, setTarget] = useState(null);
  const [rehearsal, setRehearsal] = useState(false);
  const [gradiumOn, setGradiumOnState] = useState(loadGradiumChoice);
  const [voiceStatus, setVoiceStatus] = useState(null);

  const setGradiumOn = (on) => {
    setGradiumOnState(on);
    try {
      localStorage.setItem(GRADIUM_KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };

  // Follow the owner's position from the start, so nearby care is ready when they need it.
  useEffect(() => {
    watchLocation();
  }, []);

  // Live phone calls only: is Gradium configured, and does this session have its own German voice?
  useEffect(() => {
    if (!IS_LIVE_PHONE) return undefined;
    let alive = true;
    fetch(`${PHONE_AGENT_URL || ''}/api/v1/voice/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => alive && s && setVoiceStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // Unknown status: still offer Gradium; the call falls back to the browser voice on 503.
  const gradiumAvailable = IS_LIVE_PHONE && (!voiceStatus || voiceStatus.gradium_configured === true);
  const ownVoice = !!(voiceStatus && voiceStatus.my_voice_ready);

  const t = strings[lang] || strings.en;
  const Handoff = IS_LIVE_PHONE && !rehearsal ? LiveHandoff : PhoneCall;

  const setLang = (l) => {
    setLangState(l);
    saveLang(l);
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  }, [lang]);

  const startCall = () => {
    primeSpeech(); // unlock speech on iOS while we are inside the tap
    setTriage(null);
    setVet(null);
    setInsurance(null);
    setClinic(null);
    setView('voice');
  };

  const call = (to) => {
    setRehearsal(false);
    primeSpeech();
    if (to === 'vet') {
      setView('clinics');
      return;
    }
    setTarget(to);
    setView('phone');
  };

  const pickClinic = (c) => {
    setRehearsal(false);
    primeSpeech();
    setClinic(c);
    setTarget('vet');
    setView('phone');
  };

  const callDone = (result) => {
    if (result && target === 'vet') setVet(result);
    if (result && target === 'insurance') setInsurance(result);
    setView(triage ? 'plan' : 'home');
  };

  // One progress rail through the story; shown once there is something to show progress on.
  const rail = <StepRail t={t} steps={stepState({ view, target, triage, vet, insurance })} />;

  // Rule 3: while any agent is scripted (?demo=1, a VITE_*=mock build, or the phone rehearsal), every screen says so.
  const simulated = IS_MOCK || (view === 'phone' && rehearsal);
  const screen = (() => {
    if (view === 'ownvoice') return <OwnVoice onBack={() => setView('home')} />;
    if (view === 'history') return <History onBack={() => setView('home')} />;
    if (view === 'welcome') {
      return (
        <Welcome
          onDone={(asGuest) => {
            if (asGuest) {
              try {
                localStorage.setItem(GUEST_KEY, '1');
              } catch { /* storage unavailable */ }
            }
            setView('home');
          }}
        />
      );
    }
    if (view === 'voice') {
      return (
        <VoiceCall
          t={t}
          lang={lang}
          triage={triage}
          vet={vet}
          insurance={insurance}
          onTriage={setTriage}
          rail={triage ? rail : null}
          onCall={call}
          onEnd={() => setView(triage ? 'plan' : 'home')}
        />
      );
    }
    if (view === 'clinics') {
      // Going back from the list never restarts the voice call: show the plan instead.
      return <ClinicList t={t} lang={lang} triage={triage} rail={rail} onPick={pickClinic} onBack={() => setView(triage ? 'plan' : 'home')} />;
    }
    if (view === 'phone') {
      return (
        <Handoff
          key={`${target}-${clinic ? clinic.id : ''}`}
          t={t}
          lang={lang}
          rail={rail}
          target={target}
          clinic={target === 'vet' ? clinic : null}
          gradium={gradiumAvailable ? { on: gradiumOn, ownVoice, set: setGradiumOn } : null}
          context={{
            gradiumConsent: gradiumAvailable && gradiumOn,
            voice: ownVoice ? 'my_voice' : 'standard',
            summary: buildSummary({ lang, triage, vet, insurance }),
            clinic: target === 'vet' ? clinic : undefined,
            estimate: vet ? vet.estimate : undefined,
            homeVisitFee: vet ? vet.homeVisitFee : undefined,
          }}
          onDone={callDone}
          onRehearse={() => { setGradiumOn(false); setRehearsal(true); }}
        />
      );
    }
    if (view === 'plan' && triage) {
      return (
        <Plan
          t={t}
          lang={lang}
          triage={triage}
          vet={vet}
          insurance={insurance}
          rail={rail}
          onCall={call}
          onRestart={() => setView('home')}
        />
      );
    }
    return <Home t={t} lang={lang} setLang={setLang} onStart={startCall} onOwnVoice={() => setView('ownvoice')} onHistory={() => setView('history')} />;
  })();
  return (
    <>
      {simulated && <p className="sim-banner" role="note">{t.mockBadge}</p>}
      {screen}
    </>
  );
}
