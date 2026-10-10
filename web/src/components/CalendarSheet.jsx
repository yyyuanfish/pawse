// "Your calendar (demo)": the free slot next to the vet's offer. A synthetic, read-only calendar:
// it shows busy / free time only, never event titles.
export default function CalendarSheet({ t, facts }) {
  return (
    <aside className="cal-sheet" data-beat="calendar" aria-label={`${t.calendarTitle} (${t.demo})`}>
      <div className="cal-head">
        <span className="cal-icon" aria-hidden="true">▦</span>
        <strong>{t.calendarTitle}</strong>
        <span className="sim-badge">{t.demo}</span>
      </div>
      <ol className="cal-slots">
        <li className="cal-busy">{t.calendarBusy(facts.freeFrom)}</li>
        <li className="cal-free">{t.calendarFree(facts.freeFrom)}</li>
        <li className="cal-pick">{t.calendarOffer(facts.appointment)}</li>
      </ol>
      <p className="muted small">{t.calendarNote}</p>
    </aside>
  );
}
