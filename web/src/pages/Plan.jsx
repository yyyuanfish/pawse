import { IS_LIVE_PHONE } from '../agents/index.js';
import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import PlanPanel from '../components/PlanPanel.jsx';
import { buildSummary } from '../utils/summary.js';
import { nextAction } from '../utils/steps.js';
import { copyText } from '../utils/copy.js';
import { claimChecklist, taxiOffered } from '../agents/story.js';

// "16:05 taxi → 16:30 vet" (clinic) or "home visit tonight" once the owner has chosen. Simulated, never booked.
function Today({ t, choice, confirm, taxi, facts }) {
  if (!choice) return null;
  const items =
    choice === 'home'
      ? [{ key: 'home', text: t.todayHome, ok: !!confirm }]
      : [
          { key: 'taxi', text: t.todayTaxi(facts.taxiAt), ok: !!taxi },
          { key: 'vet', text: t.todayVet(facts.appointment), ok: !!confirm },
        ];
  return (
    <section className="card today" data-beat="today">
      <div className="card-head">
        <h2>{t.todayTitle}</h2>
        <span className="sim-badge">{t.simulated}</span>
      </div>
      <ol className="today-line">
        {items.map((it, i) => (
          <li key={it.key} className={it.ok ? 'ok' : 'open'}>
            {i > 0 && <span className="today-arrow" aria-hidden="true">→</span>}
            <strong>{it.text}</strong>
            {!it.ok && <span className="muted small">{t.notConfirmed}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Plan({ t, lang, triage, vet, insurance, choice, confirm, taxi, facts, rehearsal = false, rail, onCall, onRestart }) {
  const [copied, setCopied] = useState(false);
  const summary = buildSummary({ lang, triage, vet, insurance, choice, confirm, taxi, facts });
  const next = nextAction({ vet, insurance, choice, confirm, taxi, rehearsal });
  // The live hand-off prepares a conversation about the owner's own policy: the 30 days are the demo policy's.
  const checklist = claimChecklist({ lang, claimDays: facts.claimDays, ownPolicy: !rehearsal });

  return (
    <main className="plan">
      {rail}
      <header className="plan-head">
        <Avatar size={56} />
        <h1>{t.planTitle}</h1>
      </header>

      <Today t={t} choice={choice} confirm={confirm} taxi={taxiOffered(choice) ? taxi : null} facts={facts} />

      <div className="card">
        <PlanPanel
          rehearsal={rehearsal}
          t={t}
          triage={triage}
          vet={vet}
          insurance={insurance}
          choice={choice}
          confirm={confirm}
          taxi={taxi}
          facts={facts}
          onCall={onCall}
        />
      </div>

      <section className={next === 'summary' ? 'card focus' : 'card'} data-beat="summary">
        <div className="card-head">
          <h2>{t.summary}</h2>
          <button
            type="button"
            className="btn soft small"
            onClick={async () => {
              if (await copyText(summary)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            }}
          >
            {copied ? `✓ ${t.copied}` : t.copy}
          </button>
        </div>
        <pre className="summary">{summary}</pre>
      </section>

      <section className="card" data-beat="checklist">
        <h2>{t.checklistTitle}</h2>
        <ul className="cov">
          {checklist.map((c, i) => (
            <li key={i} className="ok">
              <span className="cov-icon" aria-hidden="true">✓</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="disclaimer">{t.disclaimer}</p>
      <button type="button" className="btn ghost wide" onClick={onRestart}>
        {t.restart}
      </button>
    </main>
  );
}
