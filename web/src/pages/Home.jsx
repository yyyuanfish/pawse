import { useState } from 'react';
import { locate, clearLocation } from '../agents/location.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { IS_MOCK } from '../agents/index.js';

const PETALS = [
  { left: '8%', delay: '0s', dur: '11s', size: 12 },
  { left: '24%', delay: '3s', dur: '13s', size: 9 },
  { left: '46%', delay: '6s', dur: '12s', size: 14 },
  { left: '67%', delay: '1.5s', dur: '14s', size: 10 },
  { left: '84%', delay: '4.5s', dur: '10s', size: 13 },
];

export default function Home({ t, lang, setLang, onStart, onOwnVoice, onPetVision }) {
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  async function useLocation() {
    setLocating(true);
    try { const p = await locate(); setLocationMessage(`Location ready (accuracy about ${Math.round(p.accuracy)} m). Nearby care will use this position.`); }
    catch (e) { setLocationMessage(e.message); }
    finally { setLocating(false); }
  }
  return (
    <main className="home">
      <div className="petals" aria-hidden="true">
        {PETALS.map((p, i) => (
          <span
            key={i}
            className="petal"
            style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, width: p.size, height: p.size }}
          />
        ))}
      </div>

      <header className="topbar">
        <span className="brand">{t.appName}</span>
        <div className="lang-switch" role="group" aria-label="Language">
          {['en', 'zh', 'de', 'hi'].map((l) => (
            <button
              key={l}
              type="button"
              className={l === lang ? 'chip on' : 'chip'}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              {({zh:'中文',en:'EN',de:'DE',hi:'हिन्दी'})[l]}
            </button>
          ))}
        </div>
      </header>

      <section className="home-hero">
        <div className="home-avatar">
          <Avatar size={150} />
        </div>
        <h1>
          {t.tagline.split('\n').map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </h1>
        <button type="button" className="start-btn" onClick={onStart}>
          <Icon name="phone" size={24} />
          {t.startCall}
        </button>
        <p className="muted">{t.startHint}</p>
        <button className="btn soft" disabled={locating} onClick={useLocation}>{locating ? 'Locating…' : 'Use my current location'}</button>
        <p className="muted">Allow location to find nearby vets. Your position is shared with Pawse and its clinic search providers when you request care.</p>
        {locationMessage && <p role="status">{locationMessage}</p>}
        {locationMessage && <button className="btn ghost" onClick={()=>{clearLocation();setLocationMessage('Location cleared.');}}>Clear location</button>}

        <button className="btn soft" onClick={onPetVision}>Check a cat photo</button>
        <button className="btn soft" onClick={onOwnVoice}>Record my voice · emergency rehearsal</button>
        <p><a href="?live=1">Use backend agents</a> · <a href="?demo=1">Simulated rehearsal</a></p>
        {IS_MOCK && <span className="badge">{t.mockBadge}</span>}
      </section>

      <footer className="disclaimer">{t.disclaimer}</footer>
    </main>
  );
}
