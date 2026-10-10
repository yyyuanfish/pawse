import { IS_LIVE_PHONE } from '../agents/index.js';
import { nextAction } from '../utils/steps.js';
// Pawse's advice + the two "let Pawse call for you" actions.
// Used as the bottom sheet on the video call and at the top of the plan page.

const GLYPH = { red: '!', yellow: '◷', green: '✓' };

function ActionRow({ icon, title, sub, doneText, button, next, onClick }) {
  return (
    <div className={doneText ? 'action-row done' : 'action-row'}>
      <span className="action-icon" aria-hidden="true">{icon}</span>
      <div className="action-text">
        <strong>{title}</strong>
        <span>{doneText || sub}</span>
      </div>
      <button type="button" className={next ? 'btn primary small' : 'btn soft small'} onClick={onClick}>
        {button}
      </button>
    </div>
  );
}

export default function PlanPanel({ t, triage, vet, insurance, onCall }) {
  if (!triage) return null;
  // A live "prepared" result is only a script; it never reads as a booking or a confirmed cover.
  const vetDone = vet ? (vet.prepared ? `✓ ${t.prepared}` : `✓ ${t.booked} ${vet.time} · ≈ ${vet.currency || 'CHF'} ${vet.estimate}`) : '';
  const insDone = insurance ? (insurance.prepared ? `✓ ${t.prepared}` : `✓ ${t.outOfPocket} ≈ ${insurance.currency || 'CHF'} ${insurance.outOfPocket}`) : '';
  const next = nextAction({ vet, insurance });

  return (
    <div className="plan-panel">
      <div className={`level level-${triage.level}`}>
        <span className="level-glyph" aria-hidden="true">{GLYPH[triage.level]}</span>
        <div>
          <span className="level-kicker">{t.adviceTitle}</span>
          <strong className="level-title">{triage.headline || t.levels[triage.level]}</strong>
        </div>
      </div>

      <section>
        <h3>{t.nowDo}</h3>
        <ul className="steps">
          {triage.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        {triage.escalation && <p className="escalation">{triage.escalation}</p>}
      </section>

      {triage.askVet?.length > 0 && (
        <section>
          <h3>{t.askVet}</h3>
          <ul className="steps">
            {triage.askVet.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>{IS_LIVE_PHONE ? 'Prepare your next conversation' : t.transferTitle}</h3>
        <div className="actions">
          <ActionRow
            icon={t.callees.vet.icon}
            title={IS_LIVE_PHONE ? 'Prepare vet conversation' : t.callVet}
            sub={IS_LIVE_PHONE ? 'Review a German script and audio; no automatic call' : t.callVetSub}
            doneText={vetDone}
            next={next === 'vet'}
            button={vet ? t.callAgain : IS_LIVE_PHONE ? t.prepare : t.call}
            onClick={() => onCall('vet')}
          />
          <ActionRow
            icon={t.callees.insurance.icon}
            title={IS_LIVE_PHONE ? 'Prepare insurer conversation' : t.callIns}
            sub={IS_LIVE_PHONE ? 'Demo policy evidence and a script; coverage unconfirmed' : t.callInsSub}
            doneText={insDone}
            next={next === 'insurance'}
            button={insurance ? t.callAgain : IS_LIVE_PHONE ? t.prepare : t.call}
            onClick={() => onCall('insurance')}
          />
        </div>
        <p className="ai-note">{IS_LIVE_PHONE ? 'Review the script before sharing. Audio playback does not place a call.' : t.aiNote}</p>
      </section>
    </div>
  );
}
