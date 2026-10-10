import { useState } from 'react';
import { optionCards } from '../agents/story.js';

// After the insurer call: two option cards (A clinic today, B home visit tonight), tap to choose,
// then one primary action: Pawse calls the vet back to confirm. Numbers come from the story facts
// (live: /api/v1/demo/mimi costs; mock: the same formulas), never from the page.
export default function Options({ t, rail, facts, choice, onChoose, onConfirm, onBack }) {
  const [picked, setPicked] = useState(choice || null);
  const cur = facts.currency;
  const pick = (id) => {
    setPicked(id);
    onChoose(id);
  };

  return (
    <main className="plan options" data-beat="options">
      {rail}
      <header className="options-head">
        <h1>{t.optionsTitle}</h1>
        <p className="muted small">
          <span className="sim-badge">{t.simulated}</span> {t.optionsSub}
        </p>
      </header>

      <div className="option-list" role="radiogroup" aria-label={t.optionsTitle}>
        {optionCards(facts).map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={picked === o.id}
            className={`option-card ${picked === o.id ? 'picked' : ''}`}
            data-beat={`option-${o.id}`}
            onClick={() => pick(o.id)}
          >
            <span className="option-letter" aria-hidden="true">{o.letter}</span>
            <span className="option-body">
              <strong className="option-title">{o.id === 'clinic' ? t.optionClinic(o.time) : t.optionHome}</strong>
              <span className="option-pay">
                <span className="muted small">{t.youPayAbout}</span>
                <span className="option-amount">≈ {cur} {o.youPay}</span>
              </span>
              <span className="option-detail small">
                {cur} {o.total} {t.total} · {t.insurerPays} {cur} {o.insurerPays}
              </span>
              <span className="option-detail small">
                {o.id === 'clinic' ? t.taxiIncl(cur, o.extra) : t.homeFeeIncl(cur, o.extra)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {picked ? (
        <button type="button" className="btn primary wide" data-beat="confirm-call" onClick={onConfirm}>
          {picked === 'home' ? t.confirmHome : t.confirmClinic(facts.appointment)}
        </button>
      ) : (
        <p className="muted small options-hint">{t.tapToChoose}</p>
      )}
      <button type="button" className="btn ghost wide" data-beat="back" onClick={onBack}>
        {t.backToPlan}
      </button>
    </main>
  );
}
