import { useEffect, useState } from 'react';
import { me, register, login, logout, history } from '../agents/account.js';

const when = (s) => new Date(s * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const LEVEL = { red: 'Emergency', yellow: 'See a vet today', green: 'Keep watching' };

// Account (guest, sign in or register) and the owner's saved assessments and phone calls.
export default function History({ onBack }) {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([me().then(setUser), history().then(setItems)]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); await load(); setForm({ username: '', password: '' }); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <main className="plan history">
      <h1>My history</h1>
      <section className="card account">
        {user?.signed_in ? (
          <div className="card-head">
            <p>Signed in as <strong>{user.username}</strong></p>
            <button className="btn ghost" disabled={busy} onClick={() => act(logout)}>Sign out</button>
          </div>
        ) : (
          <>
            <h2>Keep your history on every device</h2>
            <p className="muted">Without an account, history stays in this browser.</p>
            <input aria-label="Username" placeholder="Username" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input aria-label="Password" placeholder="Password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <div className="cal-actions">
              <button className="btn primary" disabled={busy || !form.username || !form.password} onClick={() => act(() => login(form.username, form.password))}>Sign in</button>
              <button className="btn soft" disabled={busy || !form.username || !form.password} onClick={() => act(() => register(form.username, form.password))}>Create account</button>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>

      {items === null ? <p role="status">Loading…</p> : items.length === 0 ? <p className="muted">Nothing yet. Talk to Pawse or let it call a vet, and it shows up here.</p> : (
        <ol className="history-list">
          {items.map((h) => (
            <li key={h.id} className={`card history-item ${h.kind}`}>
              <div className="card-head">
                <strong>{h.kind === 'call' ? '📞 ' : '🩺 '}{h.title}</strong>
                <span className="muted">{when(h.created)}</span>
              </div>
              {h.kind === 'assessment' && <p>{LEVEL[h.detail.level] ? `${LEVEL[h.detail.level]} · ` : ''}{h.detail.summary}</p>}
              {h.kind === 'call' && (
                <>
                  <p>{h.detail.outcome?.slot ? <strong>Booked: {h.detail.outcome.slot}. </strong> : null}{h.detail.outcome?.note || h.detail.outcome?.status}</p>
                  {h.detail.lines?.length > 0 && (
                    <details>
                      <summary>Transcript ({h.detail.lines.length} lines)</summary>
                      <ol className="call-lines">
                        {h.detail.lines.map((l, i) => <li key={i} className={l.who === 'ai' ? 'ai' : 'callee'}><strong>{l.who === 'ai' ? 'Pawse' : h.detail.target === 'insurer' ? 'Insurer' : 'Vet'}</strong> {l.text}</li>)}
                      </ol>
                    </details>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <button className="btn ghost" onClick={onBack}>Back</button>
    </main>
  );
}
