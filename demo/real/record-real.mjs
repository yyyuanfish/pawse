// Records the 2-minute Mimi demo against the REAL Pawse app (/app/?live=1), not the mock.
// Gemini Live hears the owner through a virtual microphone and answers out loud; the care triage,
// the clinic search and the German draft are real backend calls; the vet and insurer calls are the
// app's own simulated rehearsal, with Pawse's German lines spoken by Gradium. The screen and the
// PulseAudio output are grabbed together by ffmpeg, so the sound in the video is what the app played.
// Run through record-real.sh, which sets up Xvfb, PulseAudio and the servers.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = process.env.OUT || 'demo-out/pawse-demo-real.mkv';
const STAGE = process.env.STAGE_URL || 'http://127.0.0.1:4180/stage.html';
const OWNER_WAV = process.env.OWNER_WAV;
const DISPLAY = process.env.DISPLAY;
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
let t0 = Date.now();
const marks = [];

const browser = await chromium.launch({
  headless: false,
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--window-position=0,0',
    '--window-size=1920,1080', '--disable-infobars', '--hide-scrollbars'],
});
const ctx = await browser.newContext({
  viewport: null,
  permissions: ['microphone', 'geolocation'],
  geolocation: { latitude: 47.3769, longitude: 8.5417 }, // Zurich, Kreis 1
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log('[console]', m.type(), m.text().slice(0, 160)); });
page.on('requestfinished', (r) => { if (r.url().includes('/api/')) log('[api]', r.method(), r.url().replace(/.*\/api/, '/api')); });
// Fullscreen through CDP (--kiosk / --start-fullscreen are ignored under Playwright), so no browser chrome is filmed.
const cdp = await ctx.newCDPSession(page);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
await page.goto(STAGE);
const app = page.frameLocator('#app');
await app.locator('.start-btn').waitFor();
await page.waitForTimeout(1500);

// Start grabbing screen + system audio only once the page is painted.
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-thread_queue_size', '1024', '-f', 'x11grab', '-framerate', '30',
  '-video_size', '1920x1080', '-draw_mouse', '0', '-i', `${DISPLAY}.0`, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'rec.monitor',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
await page.waitForTimeout(800);
t0 = Date.now();

const stage = (caption, sub = '', badges = []) => { marks.push({ t: (Date.now() - t0) / 1000, caption }); return page.evaluate((a) => window.stage(a), { caption, sub, badges }); };
const hold = (ms) => page.waitForTimeout(ms);

// A visible cursor dot inside the phone; the real mouse drives it.
const CURSOR = `(() => { if (document.getElementById('dc')) return; const d = document.createElement('div'); d.id = 'dc';
  d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:26px;height:26px;border-radius:50%;background:rgba(224,69,123,.8);box-shadow:0 0 0 5px rgba(224,69,123,.25);pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);transition:transform .08s';
  document.documentElement.appendChild(d);
  addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => d.style.transform = 'translate(-50%,-50%) scale(.7)', true);
  addEventListener('mouseup', () => d.style.transform = 'translate(-50%,-50%) scale(1)', true); })()`;
const frame = () => page.frames().find((f) => f.url().includes('/app/'));
let cur = { x: 1500, y: 600 };
async function glide(x, y, ms = 650) {
  await frame().evaluate(CURSOR).catch(() => {});
  const s = { ...cur }, n = Math.max(12, Math.round(ms / 16));
  const bend = (Math.random() - 0.5) * 80;
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const arc = Math.sin(Math.PI * t) * bend;
    await page.mouse.move(s.x + (x - s.x) * e + arc, s.y + (y - s.y) * e - arc / 2);
    await page.waitForTimeout(16);
  }
  cur = { x, y };
}
async function tap(locator, pause = 350) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await glide(b.x + b.width / 2, b.y + b.height / 2);
  await hold(pause);
  await page.mouse.down(); await hold(90); await page.mouse.up();
}
async function scrollPhone(dy, steps = 12) {
  await glide(1580, 700, 300);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await hold(40); }
}
const say = (wav) => { for (const dev of ['mic', 'rec']) spawn('paplay', [`--device=${dev}`, wav]); };

try {
  // 1. Hook
  await stage('Mimi jumped off the wardrobe. Now she is limping.', 'The owner just moved to Zurich and speaks no German.');
  await hold(4500);
  await stage('Talk to Pawse', 'A real Gemini Live voice session, no script.', [['live', 'Gemini Live']]);
  await tap(app.locator('.start-btn'));
  await tap(app.getByRole('button', { name: 'Agree and start' }), 600);
  await app.locator('text=/help/i').first().waitFor({ timeout: 30000 }); // Pawse's spoken greeting
  log('greeting');
  await hold(3500);
  await tap(app.locator('button.ctl').first()); // unmute the mic
  await hold(600);
  say(OWNER_WAV);
  await stage('The owner explains, in English', 'Pawse hears the owner through the microphone and calls its care tool.', [['live', 'Gemini Live'], ['live', 'Gemini care triage']]);

  // 2. Triage
  await app.getByText("Pawse's advice").waitFor({ timeout: 90000 });
  log('triage');
  const level = (await app.locator('.sheet h2, .sheet strong, [class*=triage]').first().textContent().catch(() => '')) || '';
  log('triage level', level);
  await stage('A clear next step, not a diagnosis', 'Triage, questions to ask and what the vet will likely do.', [['live', 'Gemini care triage']]);
  await hold(6000);
  await scrollPhone(700);
  await hold(2500);

  // 3. Nearby clinic
  await stage('Find a clinic nearby', 'Real clinics around Zurich, sorted by distance.', [['live', 'Gemini Maps clinic search']]);
  await tap(app.getByRole('button', { name: 'Prepare', exact: true }).first());
  const pick = app.getByRole('button', { name: /Prepare conversation/ }).first();
  await pick.waitFor({ timeout: 45000 });
  log('clinics');
  await hold(4500);
  await tap(pick);

  // 4. German draft for the vet, written live by Gemini
  await stage('Pawse writes the call in German', 'Gemini drafts the vet script with English subtitles. The owner reviews it first.', [['live', 'Gemini German draft']]);
  await hold(1200);
  await tap(app.getByText('Share these facts with Gemini', { exact: false }));
  await tap(app.getByRole('button', { name: 'Generate German draft' }));
  await app.getByText('Review before using').waitFor({ timeout: 65000 });
  log('draft');
  await hold(1500);
  await scrollPhone(500);
  await hold(4500);

  // 5. Vet call rehearsal: Gradium speaks Pawse's German lines, the vet's replies are simulated
  await stage('Pawse calls the vet in German', 'Pawse’s German lines are spoken by Gradium. The vet’s replies are simulated text: nothing is dialled.', [['live', 'Gradium German voice'], ['sim', 'vet replies']]);
  await tap(app.getByRole('button', { name: /simulated Mimi phone rehearsal/ }));
  await tap(app.locator('.pc-listen'));
  await tap(app.locator('.pc-gradium input'));
  await tap(app.locator('details.transcript summary'));
  const vetDone = app.getByRole('button', { name: /Back to Pawse/ });
  const ask = app.locator('.ask-card button').first();
  await Promise.race([vetDone.waitFor({ timeout: 120000 }), ask.waitFor({ timeout: 120000 })]);
  if (await ask.isVisible().catch(() => false)) {
    log('question');
    await stage('One question for the owner', 'Pawse asks in English, then answers the vet in German.', [['live', 'Gradium German voice'], ['sim', 'vet replies']]);
    await hold(2000);
    await tap(ask);
    await vetDone.waitFor({ timeout: 120000 });
  }
  log('vet done');
  await hold(4000);
  await tap(vetDone);

  // 6. Insurer call rehearsal
  await stage('Then the insurer', 'Accident covered, home visit and physio not. Cited from the real AVB terms.', [['live', 'Gradium German voice'], ['sim', 'insurer replies']]);
  await app.getByRole('button', { name: 'Prepare', exact: true }).nth(1).waitFor({ timeout: 20000 });
  await tap(app.getByRole('button', { name: 'Prepare', exact: true }).nth(1));
  await tap(app.getByRole('button', { name: /simulated Mimi phone rehearsal/ }));
  await tap(app.locator('.pc-listen'));
  await tap(app.locator('.pc-gradium input'));
  await tap(app.locator('details.transcript summary'));
  const insDone = app.getByRole('button', { name: /Back to Pawse/ });
  await insDone.waitFor({ timeout: 120000 });
  log('insurer done');
  await stage('Clinic about CHF 385 instead of 510', 'The owner sees the cost before choosing.', [['sim', 'insurer replies']]);
  await scrollPhone(600);
  await hold(6000);
  await tap(insDone);

  // 7. Summary
  await stage('One plan the owner can act on', 'Care summary, vet call, coverage, claim checklist.', [['live', 'Gemini'], ['live', 'Gradium'], ['sim', 'calls and bookings']]);
  await hold(3000);
  await scrollPhone(900, 20);
  await hold(4000);
  await stage('Pawse', 'Stay calm. Pawse handles the German.');
  await hold(4000);
} catch (e) {
  log('FAILED', e.message.split('\n')[0]);
  await page.screenshot({ path: OUT.replace(/\.\w+$/, '-fail.png') });
  process.exitCode = 1;
} finally {
  ff.stdin.write('q');
  await new Promise((r) => ff.on('close', r));
  writeFileSync(OUT.replace(/\.\w+$/, '-marks.json'), JSON.stringify(marks, null, 2));
  await browser.close();
  log('saved', OUT);
}
