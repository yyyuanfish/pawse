// Where the owner is in the story: 1 Talk · 2 Vet · 3 Insurance · 4 Summary.
export default function StepRail({ t, steps }) {
  const at = steps.findIndex((s) => s.current);
  return (
    <nav className="step-rail" aria-label={t.stepOf(at + 1, steps.length)}>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id} className={s.done ? 'done' : s.current ? 'current' : ''} aria-current={s.current ? 'step' : undefined}>
            <span className="step-dot" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
            <span className="step-name">{t.rail[s.id]}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
