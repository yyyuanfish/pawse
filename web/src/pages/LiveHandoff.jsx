import { useEffect, useRef, useState } from 'react';
import { draftHandoff, loadDemoPolicy, generateSpeech, initialVoice, preparedResult } from '../agents/handoff.js';
import ProviderChips from '../components/ProviderChips.jsx';
import InsuranceProfileForm from '../components/InsuranceProfileForm.jsx';
import { loadCapabilities, handoffProviders } from '../agents/providers.js';
import { PHONE_AGENT_URL } from '../config.js';
import LiveCallCard from '../components/LiveCallCard.jsx';

// One step at a time: facts → German script → ready. Finished steps collapse to one line with Edit.
function Done({ label, onEdit }) {
  return <div className="substep-done"><span>✓ {label}</span><button className="btn ghost small" onClick={onEdit}>Edit</button></div>;
}

export default function LiveHandoff({ t, lang, target, clinic, context, rail, onDone, onRehearse }) {
  const [step, setStep] = useState('facts'); // facts | script | ready
  const [message, setMessage] = useState(context.summary || '');
  const [consent, setConsent] = useState(false);
  const [gradiumConsent, setGradiumConsent] = useState(false);
  const [voice, setVoice] = useState(() => initialVoice(context));
  const [script, setScript] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [audio, setAudio] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState(null);
  const pending = useRef(null);
  useEffect(() => { let alive = true; loadCapabilities(PHONE_AGENT_URL || '').then(c => alive && setCaps(c)); return () => { alive = false; }; }, []);
  const audioRef = useRef('');
  useEffect(() => () => { pending.current?.abort(); if (audioRef.current) URL.revokeObjectURL(audioRef.current); }, []);
  async function run(task) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 65000);
    setBusy(true); setError('');
    try { await task(controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(e.message); else setError('Request stopped or timed out. Retry explicitly.'); }
    finally { clearTimeout(timer); pending.current = null; setBusy(false); }
  }
  function clearAudio() {
    if (audioRef.current) URL.revokeObjectURL(audioRef.current);
    audioRef.current = ''; setAudio('');
  }
  const draft = () => run(async signal => {
    clearAudio(); setScript(null);
    setScript(await draftHandoff(message, lang, target, consent, signal));
    setStep('script');
    // The demo policy evidence is local and needs no sharing consent: fetch it once the facts are in.
    if (target === 'insurance' && !evidence) setEvidence(await loadDemoPolicy(signal).catch(() => null));
  });
  const speak = () => run(async signal => {
    clearAudio();
    const blob = await generateSpeech(script.lines.map(x => x.german).join('\n'), voice, gradiumConsent, signal);
    audioRef.current = URL.createObjectURL(blob); setAudio(audioRef.current);
    setStep('ready');
  });
  const callUrl = /^tel:\+[1-9]\d{6,14}$/.test(clinic?.callUrl || '') ? clinic.callUrl : null;
  const who = target === 'insurance' ? 'insurer' : 'vet';

  return <main className="plan handoff">
    {rail}
    <h1>Prepare the {who} conversation</h1>
    <p className="note">No call has been placed. No appointment or insurance coverage has been confirmed.</p>
    {clinic && <p>{clinic.name} · {clinic.phone || 'No published phone available'}</p>}
    <LiveCallCard target={target} place={clinic?.name} summary={message} onBooked={target === 'insurance' ? null : (o) => onDone({ time: o.slot, start: o.start, place: clinic?.name || 'Vet', estimate: context.estimate, currency: 'CHF', simulated: false, confirmedBy: 'phone' })} />

    {step === 'facts' ? <section className="card substep">
      <h2>1 · What should the {who} know?</h2>
      {target === 'insurance' && <InsuranceProfileForm />}
      <label>Facts and questions<textarea aria-label="Facts and questions" value={message} maxLength={4000} onChange={e => { setMessage(e.target.value); setScript(null); clearAudio(); }} /></label>
      <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Share these facts with Gemini to draft a German script with subtitles.</label>
      <button className="btn primary" disabled={busy || !consent || !message.trim()} onClick={draft}>Draft German script</button>
    </section> : <Done label="Facts" onEdit={() => setStep('facts')} />}

    {step === 'script' && script && <section className="card substep">
      <h2>2 · Review the German script</h2>
      {script.lines.map((line, i) => <div key={i}><p lang="de">{line.german}</p><p>{line.subtitle}</p></div>)}
      <label>Speech voice <select value={voice} onChange={e => { setVoice(e.target.value); clearAudio(); }}><option value="my_voice">My approved voice</option><option value="standard">Standard German voice</option></select></label>
      {voice === 'my_voice' && context.voice !== 'my_voice' && <p className="muted">No own German voice is ready yet. Set it up once under “Demo &amp; voice settings” on the home screen, or use the standard voice.</p>}
      <label><input type="checkbox" checked={gradiumConsent} onChange={e => setGradiumConsent(e.target.checked)} /> I reviewed the script and agree to share it with Gradium using the selected voice.</label>
      <button className="btn primary" disabled={busy || !gradiumConsent} onClick={speak}>Make audio</button>
      <button className="btn ghost" disabled={busy} onClick={() => setStep('ready')}>Skip audio</button>
    </section>}
    {step === 'ready' && script && <Done label={`German script · ${script.lines.length} lines`} onEdit={() => setStep('script')} />}

    {step === 'ready' && <section className="card substep">
      <h2>3 · Ready</h2>
      {audio ? <><audio controls src={audio} /><a href={audio} download="pawse-reviewed-script.wav">Download audio</a></> : <p className="muted">No audio made. You can read the script yourself.</p>}
      {callUrl && <p>Open your device dialer for {clinic.name}. Pawse cannot join or speak into this call. <a className="btn soft" href={callUrl}>Open dialer: {clinic.phone}</a></p>}
      <button className="btn primary" onClick={() => onDone(preparedResult(target, script, audio))}>Done, back to plan</button>
    </section>}

    {target === 'insurance' && step !== 'facts' && <section className="card">
      <h2>Demo policy, not your coverage</h2>
      {evidence ? <details>
        <summary>Read the demo policy ({evidence.evidence.length} sections)</summary>
        {evidence.evidence.map(e => <article key={e.evidence_id}><h3>{e.title} · {e.section}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{e.snippet}</p><small>{e.source_id}</small></article>)}
      </details> : <p className="muted">No demo policy clauses loaded.</p>}
    </section>}

    {busy && <p role="status">Preparing…</p>}{error && <p role="alert">{error}</p>}
    <ProviderChips t={t} items={handoffProviders({ caps, voice, audioReady: !!audio, target })} />
    <details className="handoff-more">
      <summary>More</summary>
      {onRehearse && <button className="btn soft" onClick={onRehearse}>Open simulated Mimi phone rehearsal</button>}
      <button className="btn ghost" onClick={() => onDone(null)}>Back to care summary</button>
    </details>
  </main>;
}
