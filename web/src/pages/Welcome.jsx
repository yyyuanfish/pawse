import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { login, register } from '../agents/account.js';

// First screen of the live app: sign in, create an account, or continue as a guest (remembered).
export default function Welcome({ onDone }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = form.username.trim() && form.password;
  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn(form.username.trim(), form.password);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="welcome">
      <div className="home-avatar">
        <Avatar size={120} />
      </div>
      <h1>Welcome to Pawse</h1>
      <p className="muted">Sign in to keep your pet's assessments, calls and appointments on every device.</p>
      <form className="card account" onSubmit={(e) => { e.preventDefault(); if (ready) act(login); }}>
        <input aria-label="Username" placeholder="Username" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input aria-label="Password" placeholder="Password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="cal-actions">
          <button type="submit" className="btn primary" disabled={busy || !ready}>Sign in</button>
          <button type="button" className="btn soft" disabled={busy || !ready} onClick={() => act(register)}>Create account</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      <button type="button" className="btn ghost" onClick={() => onDone(true)}>Continue as guest</button>
    </main>
  );
}
