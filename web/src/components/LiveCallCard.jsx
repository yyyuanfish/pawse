import { useEffect, useRef, useState } from 'react';
import { callStatus, startRealCall } from '../agents/realCall.js';
import { resolveVoiceChoice } from '../agents/gradiumVoice.js';
import { calendarEvent, googleCalendarUrl, icsFile } from '../utils/calendar.js';

const STATE = { dialing: 'Dialing…', ringing: 'Ringing…', connected: 'Connected', ended: 'Call ended' };

// "Pawse calls now": a real phone call to the demo line, with the live transcript and the outcome.
export default function LiveCallCard({ target, place, summary, onBooked }) {
  const [status, setStatus] = useState(undefined); // undefined = loading, null = not configured
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState('');
  const [lines, setLines] = useState([]);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState('');
  const call = useRef(null);
  useEffect(() => {
    let alive = true;
    callStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
      call.current?.hangup();
      call.current?.close();
    };
  }, []);
  if (!status) return null;

  const who = target === 'insurance' ? 'Insurer' : 'Vet';
  const booked = outcome?.status === 'booked' && outcome.start
    ? calendarEvent({ start: outcome.start, title: `Vet appointment for Mimi${place ? ` · ${place}` : ''}`, place: place || '',
        details: `Booked by phone by Pawse (AI assistant). ${outcome.note || ''}\n\nCase: ${summary.slice(0, 600)}` })
    : null;
  const ics = booked ? URL.createObjectURL(new Blob([icsFile(booked)], { type: 'text/calendar' })) : null;
  const live = state && state !== 'ended';
  async function start() {
    setError('');
    setLines([]);
    setOutcome(null);
    setState('dialing');
    let voiceId = null;
    try {
      voiceId = resolveVoiceChoice(localStorage.getItem('pawse.liveVoice') || '', 'en');
    } catch { /* storage unavailable: default voice */ }
    try {
      call.current = await startRealCall({ target: target === 'insurance' ? 'insurer' : 'vet', place: place || '', summary, voiceId }, (e) => {
        if (e.type === 'status') {
          setState(e.state);
          if (e.outcome) setOutcome(e.outcome);
        } else if (e.type === 'line') setLines((l) => [...l, e]);
        else if (e.type === 'outcome') setOutcome(e);
        else if (e.type === 'error') setError(e.message);
      });
    } catch (e) {
      setState('');
      setError(e.message);
    }
  }

  return (
    <section className="card live-call">
      <div className="card-head">
        <h2>Pawse calls now</h2>
        {state && <span className={`call-pill ${live ? 'on' : ''}`}>{STATE[state] || state}</span>}
      </div>
      {!state && (
        <>
          <label>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Call the demo line and share the case facts above with
            Gemini and Gradium during the call.
          </label>
          <button className="btn primary" disabled={!agree || !summary.trim()} onClick={start}>
            Call now
          </button>
        </>
      )}
      {lines.length > 0 && (
        <ol className="call-lines" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className={l.who === 'ai' ? 'ai' : 'callee'}>
              <strong>{l.who === 'ai' ? 'Pawse' : who}</strong> {l.text}
            </li>
          ))}
        </ol>
      )}
      {outcome && (outcome.note || outcome.slot) && (
        <p className={`call-outcome ${outcome.status}`}>
          {outcome.slot ? <strong>Slot: {outcome.slot}. </strong> : null}
          {outcome.note}
        </p>
      )}
      {booked && (
        <div className="cal-actions">
          <a className="btn primary cal-google" href={googleCalendarUrl(booked)} target="_blank" rel="noopener noreferrer">
            Add to Google Calendar
          </a>
          <a className="btn soft" href={ics} download="pawse-vet-appointment.ics">
            Download .ics (Apple, Outlook)
          </a>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {live && (
        <button className="btn ghost" onClick={() => call.current?.hangup()}>
          Hang up
        </button>
      )}
      {state === 'ended' && outcome?.status === 'booked' && outcome.slot && onBooked && (
        <button className="btn primary" onClick={() => onBooked(outcome)}>
          Add to my plan
        </button>
      )}
      {state === 'ended' && (
        <button className="btn soft" onClick={() => setState('')}>
          Call again
        </button>
      )}
    </section>
  );
}
