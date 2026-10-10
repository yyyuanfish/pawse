// Records the 2-minute Mimi demo against the REAL Pawse app (/app/?live=1), not the mock.
// Gemini Live hears the owner through a virtual microphone and answers out loud; the care triage,
// the clinic search and the German draft are real backend calls; the vet and insurer calls are the
// app's own simulated rehearsal, with Pawse's German lines spoken by Gradium. The screen and the
// PulseAudio output are grabbed together by ffmpeg, so the sound in the video is what the app played.
// Run through record-real.sh, which sets up Xvfb, PulseAudio and the servers.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.env.OUT || 'demo-out/pawse-demo-real.mkv';
const STAGE = process.env.STAGE_URL || 'http://127.0.0.1:4180/stage.html';
const OWNER_WAV = process.env.OWNER_WAV;
// Optional narrator over the opening (make-owner-line.py with another voice). Played into `rec` only, never `mic`,
// so Gemini Live does not hear it; the opening lasts until it has finished.
const NARRATION_WAV = process.env.NARRATION_WAV || '';
// Length of a PCM WAV from its header: data-chunk bytes / byte rate.
function wavSeconds(file) {
  const b = readFileSync(file);
  let byteRate = 0;
  for (let i = 12; i + 8 <= b.length;) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(i + 16);
    if (id === 'data' && byteRate) return Math.min(size, b.length - i - 8) / byteRate;
    i += 8 + size + (size & 1);
  }
  throw new Error(`not a PCM WAV: ${file}`);
}
// Mimi footage (AI-generated, see make-mimi-clip.py): the stage opens on MIMI_INTRO, and the app's camera preview shows
// MIMI_CAMERA instead of a real camera; MIMI_STILL is sent to Gemini as the owner's photo.
const { MIMI_INTRO, MIMI_CAMERA, MIMI_STILL } = process.env;
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
// Camera stand-in: video requests get a stream of the Mimi clip, audio keeps the real (PulseAudio) microphone.
// The clip is served from the app's own origin so the canvas stays untainted. One clip per page, played once: it is
// drawn onto a canvas whose stream outlives the clip (the preview freezes on the last frame instead of the track
// ending), and every camera request gets a clone of that one track, so reopening the camera never restarts Mimi.
// window.__mimiCamTime() is the clip's clock, so the recorder can time the photo and the camera-off tap against it.
if (MIMI_CAMERA) {
  await ctx.route('**/__mimi-camera.mp4', (route) => route.fulfill({ path: MIMI_CAMERA, contentType: 'video/mp4' }));
  await ctx.addInitScript(() => {
    if (!location.pathname.startsWith('/app')) return;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let clip = null;
    const start = async () => {
      const v = Object.assign(document.createElement('video'), { src: '/__mimi-camera.mp4', muted: true, playsInline: true, loop: false });
      await new Promise((ok, fail) => { v.onloadeddata = ok; v.onerror = () => fail(new Error('Mimi clip did not load')); });
      const canvas = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
      const g = canvas.getContext('2d');
      const draw = () => { g.drawImage(v, 0, 0, canvas.width, canvas.height); if (!v.ended) v.requestVideoFrameCallback(draw); };
      v.requestVideoFrameCallback(draw);
      await v.play();
      return { v, track: canvas.captureStream(30).getVideoTracks()[0] };
    };
    window.__mimiCamTime = () => (clip && clip.v ? (clip.v.ended ? clip.v.duration : clip.v.currentTime) : -1);
    navigator.mediaDevices.getUserMedia = async (c = {}) => {
      if (!c.video) return real(c);
      clip = clip || start().then((x) => (clip = x));
      const { track } = await clip;
      const tracks = [track.clone()];
      if (c.audio) tracks.push(...(await real({ audio: c.audio })).getAudioTracks());
      return new MediaStream(tracks);
    };
  });
}
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
  // 1. Hook: Mimi on her three legs (AI-generated clip, labelled on screen)
  // The narrator sets the scene over the clip and the hook caption; the app starts only once it has finished, so
  // the Gemini Live greeting never talks over it.
  const narration = NARRATION_WAV ? wavSeconds(NARRATION_WAV) : 0;
  const narrationEnds = Date.now() + (narration + 0.5) * 1000;
  if (narration) { spawn('paplay', ['--device=rec', NARRATION_WAV]); log('narration', narration.toFixed(1) + 's'); }
  if (MIMI_INTRO) {
    await page.evaluate((a) => window.intro(a), { src: 'mimi.mp4', caption: 'Zurich. Mimi jumped off the wardrobe. Now she is limping.',
      seconds: 7.5, volume: narration ? 0.25 : 0.6 });
  }
  await stage('Your cat is hurt. You don’t speak German.', 'The owner just moved to Zurich.');
  await hold(Math.max(2500, narrationEnds - Date.now()));
  await stage('Talk to Pawse', 'A real Gemini Live voice session, no script.', [['live', 'Gemini Live']]);
  await tap(app.locator('.start-btn'));
  await tap(app.getByRole('button', { name: 'Agree and start' }), 600);
  await app.locator('text=/help/i').first().waitFor({ timeout: 30000 }); // Pawse's spoken greeting
  log('greeting');
  await hold(2500);

  // 2. The owner films Mimi and sends a photo, then speaks
  if (MIMI_CAMERA) {
    await stage('The owner shows Mimi', 'Camera preview stays on the phone. One photo goes to Gemini.', [['live', 'Gemini Live'], ['gen', 'Mimi footage']]);
    await tap(app.getByRole('button', { name: 'Camera', exact: true }));
    await app.locator('video').first().waitFor({ timeout: 10000 }).catch(() => log('camera preview did not appear'));
    // Timed on the clip's own clock, not fixed waits: under recording load the page runs late and a fixed hold can
    // outlast the 8 s clip.
    const clipAt = async (s) => {
      for (let i = 0; i < 100 && ((await frame().evaluate(() => window.__mimiCamTime && window.__mimiCamTime()).catch(() => -1)) < s); i++) await hold(100);
    };
    await clipAt(2.5); // the still is cut from 2.5 s of the same clip
    if (MIMI_STILL) { await app.locator('input[type=file]').setInputFiles(MIMI_STILL); log('photo sent'); }
    await clipAt(5.5); // the tap glides for about a second, so the preview closes before the clip's last frame
    const close = app.locator('.cam-tool[aria-label="Turn camera off"]');
    await tap((await close.count()) ? close : app.getByRole('button', { name: 'Camera', exact: true }));
    await app.locator('video').first().waitFor({ state: 'detached', timeout: 3000 })
      .then(() => log('camera off'))
      .catch(async () => { log('camera still on, toggling again'); await tap(app.getByRole('button', { name: 'Camera', exact: true })); });
  }
  await tap(app.locator('button.ctl').first()); // unmute the mic
  await hold(600);
  say(OWNER_WAV);
  await stage('The owner explains, in English', 'Pawse hears the owner through the microphone and calls its care tool.', [['live', 'Gemini Live'], ['live', 'Gemini care triage']]);

  // 3. Triage
  await app.getByText("Pawse's advice").waitFor({ timeout: 90000 });
  log('triage');
  const level = (await app.locator('.sheet h2, .sheet strong, [class*=triage]').first().textContent().catch(() => '')) || '';
  log('triage level', level);
  await stage('A clear next step, not a diagnosis', 'Triage, questions to ask and what the vet will likely do.', [['live', 'Gemini care triage']]);
  await hold(5000);
  await scrollPhone(700);
  await hold(2000);

  // 4. Nearby clinic
  await stage('Find a clinic nearby', 'Real clinics around Zurich.', [['live', 'Gemini Maps clinic search']]);
  await tap(app.locator('.action-row button.btn.primary').first());
  const pick = app.getByRole('button', { name: /Prepare conversation/ }).first();
  await pick.waitFor({ timeout: 45000 });
  log('clinics');
  await hold(3500);
  await tap(pick);

  // 5. German draft for the vet, written live by Gemini
  await stage('Pawse writes the call in German', 'Gemini drafts the vet script with English subtitles. The owner reviews it first.', [['live', 'Gemini German draft']]);
  await hold(1000);
  await tap(app.getByText('Share these facts with Gemini', { exact: false }));
  await tap(app.getByRole('button', { name: 'Draft German script' }));
  await app.getByText('Review the German script').waitFor({ timeout: 65000 });
  log('draft');
  await hold(1500);
  await scrollPhone(500);
  await hold(3500);
  await tap(app.locator('details.handoff-more summary'));
  await tap(app.getByRole('button', { name: /simulated Mimi phone rehearsal/ }));

  // A call screen: listen in, opt in to Gradium's German voice, open the transcript, wait for the "next" button.
  const next = app.locator('[data-beat=next]');
  // Calls are marked so make-cut.py can play their middle sped up (the demo script's "speed up the calls").
  async function call(label) {
    marks.push({ t: (Date.now() - t0) / 1000, call: label, edge: 'start' });
    await app.locator('.pc-listen').waitFor({ timeout: 20000 });
    if (!(await app.locator('.pc-listen.on').count())) await tap(app.locator('.pc-listen'));
    const gradium = app.locator('.pc-gradium input');
    if (await gradium.isVisible().catch(() => false) && !(await gradium.isChecked())) await tap(gradium);
    await tap(app.locator('details.transcript summary')).catch(() => {});
    await next.waitFor({ timeout: 150000 });
    marks.push({ t: (Date.now() - t0) / 1000, call: label, edge: 'end' });
    log(label, 'done');
  }

  // 6. Vet call, with the owner's calendar
  await stage('Pawse calls the vet in German', 'Pawse’s German lines are spoken by Gradium. The vet’s replies are simulated text: nothing is dialled.', [['live', 'Gradium German voice'], ['sim', 'vet replies']]);
  const cal = app.locator('[data-beat=calendar]');
  cal.waitFor({ timeout: 120000 }).then(() => cal.scrollIntoViewIfNeeded()).then(() => stage('16:30 fits the owner’s calendar', 'Pawse reads free time only, never event titles.', [['sim', 'demo calendar'], ['sim', 'vet replies']])).catch(() => {});
  await call('vet');
  await hold(2500);
  await tap(next); // Next: call the insurer

  // 7. Insurer call
  await stage('Then the insurer', 'Accident covered, home visit and physio not. Cited from the real AVB terms.', [['live', 'Gradium German voice'], ['sim', 'insurer replies']]);
  await call('insurer');
  await hold(3000);
  await tap(next); // Next: see your options

  // 8. Clinic or home visit
  await app.locator('[data-beat=options]').waitFor({ timeout: 20000 });
  await stage('Clinic about CHF 385 instead of 510', 'The home-visit fee is not covered. The owner chooses.', [['sim', 'demo estimates']]);
  await hold(3500);
  await tap(app.locator('[data-beat=option-clinic]'));
  await hold(1200);
  await tap(app.locator('[data-beat=confirm-call]'));

  // 9. Confirm with the vet
  await stage('Pawse confirms 16:30 with the vet', 'Itemised invoice please, and no physio without asking: it isn’t covered.', [['live', 'Gradium German voice'], ['sim', 'vet reply']]);
  await call('confirm');
  await hold(2000);
  await tap(next); // Next: call a taxi

  // 10. Taxi
  await stage('A taxi that takes cats', '16:05 pickup, cat in a carrier. Transport is not insured.', [['live', 'Gradium German voice'], ['sim', 'taxi reply']]);
  await call('taxi');
  await hold(2000);
  await tap(next); // See your plan

  // 11. Plan
  await app.locator('[data-beat=today]').waitFor({ timeout: 20000 });
  await stage('One plan the owner can act on', '16:05 taxi, 16:30 vet, case summary and claim checklist.', [['live', 'Gemini'], ['live', 'Gradium'], ['sim', 'calls and bookings']]);
  await hold(3000);
  await scrollPhone(900, 20);
  await hold(3500);
  await stage('Pawse', 'A little cat. A helping hand.');
  await hold(3500);
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
