import FacialCues from '../components/FacialCues.jsx';
import InjuryHandoff from '../components/InjuryHandoff.jsx';
import { hasVisibleInjury } from '../agents/injuryHandoff.js';
import { observePhoto, observationMessage } from '../agents/petVision.js';
import { useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PlanPanel from '../components/PlanPanel.jsx';
import useUserMedia from '../hooks/useUserMedia.js';
import ProviderChips from '../components/ProviderChips.jsx';
import { createVoiceAgent, VOICE_WANTS_AUDIO, IS_LIVE_VOICE, VOICE_PATH } from '../agents/index.js';
import { isSpeechMuted, setSpeechMuted, resolveVoiceName, onVoicesChanged } from '../agents/speech.js';
import { loadCapabilities, voiceCallProviders } from '../agents/providers.js';
import { VOICE_AGENT_URL } from '../config.js';
import { validateTriage } from '../contracts.js';

function fmt(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

// Voice first. The camera and photos are optional extras the user can add any time.
export default function VoiceCall({ t, lang, triage, vet, insurance, onTriage, onCall, onEnd }) {
  const [consent, setConsent] = useState(false);
  const [toolResults, setToolResults] = useState([]);
  const [trace, setTrace] = useState([]);
  const [camOn, setCamOn] = useState(false);
  const [facing, setFacing] = useState('environment');
  const [micOn, setMicOn] = useState(!IS_LIVE_VOICE);
  const [soundOn, setSoundOn] = useState(!isSpeechMuted());
  const [aiLine, setAiLine] = useState('');
  const [userLine, setUserLine] = useState('');
  const [speaking, setSpeaking] = useState('none');
  const [listening, setListening] = useState(false);
  const [chips, setChips] = useState([]);
  const [draft, setDraft] = useState('');
  const [photoBusy,setPhotoBusy]=useState(false),[photoResult,setPhotoResult]=useState(null),[photoMenu,setPhotoMenu]=useState(false);
  const photoRequest=useRef(null), captureRef=useRef(null);
  const [photos, setPhotos] = useState([]); // { url, received }
  const [error, setError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(true);
  const [secs, setSecs] = useState(0);
  const [caps, setCaps] = useState(null);
  const [browser, setBrowser] = useState(() => resolveVoiceName(lang));

  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const agentRef = useRef(null);
  const contextMessages = useRef(new Set());
  function sendContext(text) {
    contextMessages.current.add(text);
    agentRef.current?.sendText(text);
  }
  const photoUrls = useRef([]);
  const onTriageRef = useRef(onTriage);
  onTriageRef.current = onTriage;

  const mic = useUserMedia({ enabled: VOICE_WANTS_AUDIO && consent && micOn, audio: true });
  const cam = useUserMedia({ enabled: camOn, video: true, facing });

  // ---- the conversation with Pawse
  useEffect(() => {
    if (IS_LIVE_VOICE && !consent) return;
    const agent = createVoiceAgent({ lang, shareWithGemini: consent });
    agentRef.current = agent;
    const off = agent.on((e) => {
      switch (e.type) {
        case 'transcript':
          if (e.role === 'ai') setAiLine(e.text);
          else if (!contextMessages.current.has(e.text)) setUserLine(e.text);
          break;
        case 'speaking':
          setSpeaking(e.who);
          break;
        case 'listening':
          setListening(e.on);
          break;
        case 'suggestions':
          setChips(e.items || []);
          break;
        case 'image_received':
          setPhotos((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, received: true } : x)));
          break;
        case 'tool_result': setToolResults(p => [...p.slice(-4), e]); break;
        case 'agents': setTrace(e.trace); break;
        case 'triage': {
          const problems = validateTriage(e);
          if (problems.length) console.warn('[Pawse] triage violates the contract:', problems, e);
          onTriageRef.current(e);
          setSheetOpen(true);
          break;
        }
        case 'error':
          setError(e.message || '');
          break;
        default:
          break;
      }
    });
    agent.setMicMuted(!micOn);
    agent.setOutputMuted?.(!soundOn);
    agent.start();
    return () => {
      off();
      agent.end();
    };
  }, [lang, consent]);

  // ---- which AI runs this call (model ids come from the backend, never hardcoded)
  useEffect(() => {
    let alive = true;
    if (IS_LIVE_VOICE) loadCapabilities(VOICE_AGENT_URL || '').then((c) => alive && setCaps(c));
    const refresh = () => setBrowser(resolveVoiceName(lang));
    refresh();
    const off = onVoicesChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [lang]);

  // ---- media → <video> and → agent
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cam.stream || null;
  }, [cam.stream, camOn]);

  useEffect(() => {
    agentRef.current && agentRef.current.attachMedia({ audio: mic.stream || null, video: cam.stream || null });
  }, [mic.stream, cam.stream]);

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      photoRequest.current?.abort();
      photoUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  // keep the screen awake during the call (best effort)
  useEffect(() => {
    let lock = null;
    (async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not available */
      }
    })();
    return () => {
      try {
        lock && lock.release();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const send = (text) => {
    const s = String(text || '').trim();
    if (!s) return;
    agentRef.current && agentRef.current.sendText(s);
    setDraft('');
  };

  async function submitPhoto(file) {
    if(!file || photoRequest.current)return;
    setPhotoMenu(false);setError('');setPhotoResult(null);
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3000000){setError('Use JPEG, PNG or WebP up to 3 MB.');return;}
    const url=URL.createObjectURL(file);photoUrls.current.push(url);
    setPhotos(p=>[...p,{url,received:false}]);
    if(!IS_LIVE_VOICE){agentRef.current?.sendImage(file);return;}
    const controller=new AbortController();photoRequest.current=controller;setPhotoBusy(true);
    const timer=setTimeout(()=>controller.abort(),45000);
    try {
      const result=await observePhoto(file,consent,controller.signal);
      if(controller.signal.aborted)return;
      setPhotoResult(result);setPhotos(p=>p.map(x=>x.url===url?{...x,received:true}:x));
      sendContext(observationMessage(result));
      setUserLine("Photo shared for visual observations.");
    } catch(e) { if(!controller.signal.aborted)setError(e.message);else setError('Photo analysis stopped or timed out. Please retry.'); }
    finally {clearTimeout(timer);photoRequest.current=null;setPhotoBusy(false);}
  }
  const onPhoto=e=>{const file=e.target.files?.[0];e.target.value='';submitPhoto(file);};
  const takeFrame=()=>{
    const video=videoRef.current;
    if(!video?.videoWidth){setError('Camera is not ready. Allow camera access or upload a photo.');return;}
    const canvas=document.createElement('canvas');const scale=Math.min(1,1280/video.videoWidth);
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{if(blob)submitPhoto(new File([blob],'cat-camera.jpg',{type:'image/jpeg'}));},'image/jpeg',0.85);
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    agentRef.current && agentRef.current.setMicMuted(!next);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSpeechMuted(!next);
    agentRef.current?.setOutputMuted?.(!next);
  };

  const status = listening ? null : speaking === 'ai' ? t.aiSpeaking : aiLine ? '' : t.connecting;
  const sheetVisible = triage && sheetOpen && !hasVisibleInjury(photoResult) && !photoResult?.facial_estimate;
  const lastPhoto = photos[photos.length - 1];

  return (
    <main className="vcall">
      {IS_LIVE_VOICE && !consent && <section className="card">
        <p>Share your messages, selected photos and recorded speech with Gemini for care guidance. Gemini Live returns native audio. Camera video is a local preview only. Enable your microphone after starting; headphones help prevent echo.</p>
        <button className="btn primary" onClick={() => setConsent(true)}>Agree and start</button>
        <button className="btn ghost" onClick={onEnd}>Back</button>
      </section>}
      {toolResults.map((result,i) => <details className="card" key={i}><summary>{result.name}</summary>
        {result.ui.lines?.map((line,j)=><p key={j}>{line.german}<br/>{line.subtitle}</p>)}
        {result.ui.evidence?.map(e=><p key={e.evidence_id}>Demo policy · {e.title} · {e.section}: {e.snippet}</p>)}
        {result.ui.action === 'confirm_call' && /^tel:\+[1-9]\d{6,14}$/.test(result.ui.call_url || '') && <p>No call placed. <a href={result.ui.call_url}>Open device dialer for {result.ui.clinic_name}</a></p>}
      </details>)}
      {trace.length > 0 && <details className="card"><summary>Agent results</summary>{trace.map(x => <p key={x.agent_id}>{x.agent_id}: {x.state} — {x.detail}</p>)}</details>}
      <div className="vcall-top">
        <span className="timer-pill">
          <span className="rec-dot" aria-hidden="true" /> {fmt(secs)}
        </span>
        {triage && <span className={`top-level level-${triage.level}`}>{triage.headline || t.levels[triage.level]}</span>}
        <button type="button" className="round-btn" onClick={toggleSound} aria-pressed={!soundOn} aria-label={t.sound} title={t.sound}>
          <Icon name={soundOn ? 'volume' : 'volumeOff'} size={20} />
        </button>
      </div>

      <section className="stage">
        {camOn ? (
          <div className="cam-card">
            {cam.stream ? (
              <video ref={videoRef} className={facing === 'user' ? 'mirror' : ''} autoPlay playsInline muted />
            ) : (
              <div className="cam-msg">
                <Icon name="videoOff" size={28} />
                <span>{cam.error ? t.camUnavailable : t.camOpening}</span>
              </div>
            )}
            <div className={`cam-pip ${speaking === 'ai' ? 'talking' : ''}`}>
              <Avatar size={52} speaking={speaking === 'ai'} listening={listening} />
            </div>
            <div className="cam-tools">
              <button type="button" className="cam-tool" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label={t.flip} disabled={!cam.stream}>
                <Icon name="flip" size={18} />
              </button>
              <button type="button" className="cam-tool" onClick={() => setCamOn(false)} aria-label={t.closeCamera}>
                <Icon name="x" size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className={`avatar-stage ${speaking === 'ai' ? 'talking' : ''} ${listening ? 'listening' : ''}`}>
            <span className="halo h1" aria-hidden="true" />
            <span className="halo h2" aria-hidden="true" />
            <Avatar size={168} speaking={speaking === 'ai'} listening={listening} />
          </div>
        )}
        <p className="stage-name">Pawse</p>
        <ProviderChips t={t} items={voiceCallProviders({ path: VOICE_PATH, caps, browser, muted: !soundOn })} />
        <p className="stage-status" aria-live="polite">
          {listening ? (
            <span className="listening-label">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {t.listening}
            </span>
          ) : (
            status
          )}
        </p>
      </section>

      {!sheetVisible && (
        <div className="vcall-bottom">
          <div className="captions" aria-live="polite">
            {userLine && <p className="cap-user">{userLine}</p>}
            {lastPhoto && (
              <div className="cap-photo">
                <img src={lastPhoto.url} alt={t.photoSent} />
                <span>{lastPhoto.received ? `✓ ${t.photoSent}` : '…'}</span>
              </div>
            )}
            {photoBusy&&<p role="status">Analyzing your photo…</p>}
            {photoResult?.injury&&(photoResult.injury.wound==='suspected'||photoResult.injury.blood_like_material==='suspected')&&<div role="alert" className="cap-error"><strong>Possible injury / blood-like material</strong><p>{photoResult.injury.description}</p><p>{photoResult.next_step}</p><p>Is it bleeding now? Is the bleeding heavy or not stopping?</p></div>}
            {hasVisibleInjury(photoResult)&&<InjuryHandoff observation={photoResult} lang={lang} shareWithGemini={consent} onContext={sendContext}/>}
            <FacialCues result={photoResult}/>{photoResult&&<details><summary>Photo observations · {photoResult.image_quality}</summary>{Object.entries(photoResult.visible_observations).map(([k,v])=><p key={k}>{k}: {v}</p>)}{photoResult.injury&&<p>Injury observation: {photoResult.injury.description} Active bleeding cannot be determined from a photo.</p>}{photoResult.limitations.map((x,i)=><p key={i}>{x}</p>)}<p>{photoResult.disclaimer}</p></details>}
            {aiLine && <p className="cap-ai">{aiLine}</p>}
            {error && <p className="cap-error">{error}</p>}
            {VOICE_WANTS_AUDIO && mic.error && <p className="cap-error">{t.micUnavailable}</p>}
          </div>

          {chips.length > 0 && (
            <div className="kw-chips" role="group" aria-label="Suggestions">
              {chips.map((c) => (
                <button key={c} type="button" className="kw-chip" onClick={() => send(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          <form
            className="type-bar"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <button type="button" className="type-icon" disabled={photoBusy || (IS_LIVE_VOICE && !consent)} onClick={() => setPhotoMenu(v=>!v)} aria-label={t.photo} title={t.photo}>
              <Icon name="camera" size={20} />
            </button>
            <input
              disabled={IS_LIVE_VOICE && !consent}
              maxLength={4000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.typePlaceholder}
              aria-label={t.typePlaceholder}
              enterKeyHint="send"
            />
            <button type="submit" className="type-send" aria-label={t.send} disabled={!draft.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
          {photoMenu&&<div className="kw-chips" role="group" aria-label="Photo options"><button type="button" onClick={()=>fileRef.current?.click()}>Upload photo</button><button type="button" onClick={()=>captureRef.current?.click()}>Take photo</button></div>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhoto}/>
          <input ref={captureRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto}/>
          {camOn&&<button className="btn soft" disabled={photoBusy||(IS_LIVE_VOICE&&!consent)} onClick={takeFrame}>Capture and analyze</button>}
          {cam.error&&<p role="alert">Camera unavailable. Allow access or upload a photo.</p>}

          <nav className="call-controls" aria-label="Call controls">
            <button type="button" className={micOn ? 'ctl' : 'ctl off'} onClick={toggleMic} aria-pressed={!micOn} aria-label={t.mic}>
              <Icon name={micOn ? 'mic' : 'micOff'} size={26} />
            </button>
            <button type="button" className="ctl hang" onClick={onEnd} aria-label={t.hangup}>
              <Icon name="phone" size={28} style={{ transform: 'rotate(135deg)' }} />
            </button>
            <button type="button" className={camOn ? 'ctl on' : 'ctl'} onClick={() => setCamOn((v) => !v)} aria-pressed={camOn} aria-label={t.camera}>
              <Icon name={camOn ? 'video' : 'videoOff'} size={26} />
            </button>
          </nav>
        </div>
      )}

      {triage && !sheetOpen && (
        <button type="button" className="reopen" onClick={() => setSheetOpen(true)}>
          <Icon name="chevronUp" size={18} /> {t.viewAdvice}
        </button>
      )}

      {sheetVisible && (
        <div className="sheet" role="dialog" aria-label={t.adviceTitle}>
          <div className="sheet-grab" aria-hidden="true" />
          <PlanPanel t={t} triage={triage} vet={vet} insurance={insurance} onCall={onCall} />
          <div className="sheet-foot">
            <button type="button" className="btn ghost" onClick={() => setSheetOpen(false)}>
              {t.keepTalking}
            </button>
            <button type="button" className="btn soft" onClick={onEnd}>
              {t.done}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
