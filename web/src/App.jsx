import { useEffect, useState } from 'react';
import OwnVoice from './pages/OwnVoice.jsx';
import Home from './pages/Home.jsx';
import VoiceCall from './pages/VoiceCall.jsx';
import ClinicList from './pages/ClinicList.jsx';
import LiveHandoff from './pages/LiveHandoff.jsx';
import PhoneCall from './pages/PhoneCall.jsx';
import Plan from './pages/Plan.jsx';
import Options from './pages/Options.jsx';
import History from './pages/History.jsx';
import Welcome from './pages/Welcome.jsx';
import { me } from './agents/account.js';
import { watchLocation } from './agents/location.js';
import { strings, detectLang, saveLang } from './i18n.js';
import { primeSpeech } from './agents/speech.js';
import { buildSummary } from './utils/summary.js';
import { stepState, nextAction } from './utils/steps.js';
import StepRail from './components/StepRail.jsx';
import { IS_LIVE_PHONE, IS_MOCK } from './agents/index.js';
import { PHONE_AGENT_URL } from './config.js';
import { loadStory, mockStory, storyFacts, taxiOffered } from './agents/story.js';

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
//   → options: A clinic today / B home visit tonight
//   → "confirm": Pawse calls the clinic back → "taxi" (clinic only)
//   → plan (summary + claim checklist)
// The extended story is an explicit rehearsal; real Twilio calls keep their own handoff.
export default function App() {
  const [view, setView] = useState('home'); // home | voice | clinics | phone | options | plan
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
  useEffect(() => { watchLocation(); }, []);
  const [lang, setLangState] = useState(detectLang);
  const [triage, setTriage] = useState(null);
  const [vet, setVet] = useState(null);
  const [insurance, setInsurance] = useState(null);
  const [choice, setChoice] = useState(null); // 'clinic' | 'home', from the option cards
  const [confirm, setConfirm] = useState(null);
  const [taxi, setTaxi] = useState(null);
  const [story, setStory] = useState(mockStory);
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
  // The story numbers behind the calendar, option cards and checklist (live: /api/v1/demo/mimi).
  useEffect(() => {
    if (!IS_LIVE_PHONE) return undefined;
    let alive = true;
    loadStory({ live: true, base: PHONE_AGENT_URL || '' }).then((s) => alive && setStory(s));
    return () => {
      alive = false;
    };
  }, []);
  const facts = storyFacts(story);

  // Unknown status: still offer Gradium; the call falls back to the browser voice on 503.
  const gradiumAvailable = IS_LIVE_PHONE && (!voiceStatus || voiceStatus.gradium_configured === true);
  const ownVoice = !!(voiceStatus && voiceStatus.my_voice_ready);

  const t = strings[lang] || strings.en;
  const storyMode = !IS_LIVE_PHONE || rehearsal;
  // Live mode prepares the vet and insurer conversations for the owner (LiveHandoff) unless they chose
  // the rehearsal; the confirmation and taxi calls are always the scripted, simulated story calls.
  const scripted = target === 'confirm' || target === 'taxi';
  const Handoff = IS_LIVE_PHONE && !rehearsal && !scripted ? LiveHandoff : PhoneCall;

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
    setChoice(null);
    setConfirm(null);
    setTaxi(null);
    setClinic(null);
    setRehearsal(false);
    setView('voice');
  };

  // Rehearsal, once chosen, stays on for the rest of this story (vet → insurer → …) until "Call Pawse" again.
  const call = (to) => {
    primeSpeech();
    if (['options', 'confirm', 'taxi'].includes(to) && !storyMode) return;
    if (to === 'vet') {
      setView('clinics');
      return;
    }
    if (to === 'options') {
      setView('options');
      return;
    }
    if (to === 'summary') {
      setView('plan');
      return;
    }
    if (to === 'taxi' && !taxiOffered(choice)) return; // the taxi only goes with the clinic option
    setTarget(to);
    setView('phone');
  };

  const pickClinic = (c) => {
    primeSpeech();
    setClinic(c);
    setTarget('vet');
    setView('phone');
  };

  // The story state as it will be once this call's result is stored.
  const withResult = (result) => ({
    vet: result && target === 'vet' ? result : vet,
    insurance: result && target === 'insurance' ? result : insurance,
    choice,
    rehearsal: storyMode,
    confirm: result && target === 'confirm' ? result : confirm,
    taxi: result && target === 'taxi' ? result : taxi,
  });

  // A finished call offers the story's next step as its primary button; "back" returns to the plan.
  const callDone = (result, { next = false } = {}) => {
    if (result && target === 'vet') setVet(result);
    if (result && target === 'insurance') setInsurance(result);
    if (result && target === 'confirm') setConfirm(result);
    if (result && target === 'taxi') setTaxi(result);
    if (next && result && triage) {
      call(nextAction(withResult(result)));
      return;
    }
    setView(triage ? 'plan' : 'home');
  };
  const nextLabel = (result) => {
    if (!triage) return null;
    const n = nextAction(withResult(result));
    return t.next[n] ? { label: t.next[n], toPlan: n === 'summary' } : null;
  };

  const choose = (c) => {
    if (c !== choice) {
      setConfirm(null); // a new choice needs a new confirmation (and taxi)
      setTaxi(null);
    }
    setChoice(c);
  };

  // One progress rail through the story; shown once there is something to show progress on.
  const rail = <StepRail t={t} steps={stepState({ view, target, triage, vet, insurance, choice, confirm, taxi, rehearsal: storyMode })} />;

  const screen = (() => {
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

  if (view === 'ownvoice') return <OwnVoice onBack={() => setView('home')} />;
  if (view === 'voice') {
    return (
      <VoiceCall
        t={t}
        lang={lang}
        triage={triage}
        vet={vet}
        insurance={insurance}
        rehearsal={storyMode}
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
        clinic={target === 'vet' || target === 'confirm' ? clinic : null}
        facts={facts}
        nextLabel={nextLabel}
        gradium={gradiumAvailable ? { on: gradiumOn, ownVoice, set: setGradiumOn } : null}
        context={{
          gradiumConsent: gradiumAvailable && gradiumOn,
          voice: ownVoice ? 'my_voice' : 'standard',
          summary: buildSummary({ lang, triage, vet, insurance, choice, confirm, taxi, facts }),
          clinic: target === 'vet' || target === 'confirm' ? (clinic || undefined) : undefined,
          choice: choice || undefined,
          estimate: vet ? vet.estimate : undefined,
          homeVisitFee: vet ? vet.homeVisitFee : undefined,
        }}
        onDone={callDone}
        onRehearse={() => { setGradiumOn(false); setRehearsal(true); }}
      />
    );
  }
  if (view === 'options' && triage && storyMode) {
    return (
      <Options
        t={t}
        rail={rail}
        facts={facts}
        choice={choice}
        onChoose={choose}
        onConfirm={() => call('confirm')}
        onBack={() => setView('plan')}
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
        choice={choice}
        confirm={confirm}
        taxi={taxi}
        facts={facts}
        rehearsal={storyMode}
        rail={rail}
        onCall={call}
        onRestart={() => setView('home')}
      />
    );
  }
  return <Home t={t} lang={lang} setLang={setLang} onStart={startCall} onOwnVoice={() => setView('ownvoice')} onHistory={() => setView('history')} />;
  })();
  return <>
    {(IS_MOCK || rehearsal) && <p className="sim-banner" role="note">{t.mockBadge}</p>}
    {screen}
  </>;
}
