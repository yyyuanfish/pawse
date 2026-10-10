// Browser walkthrough (Playwright, headless). Not part of check.sh: needs a running backend serving /app
// and Playwright installed outside web/ (e.g. npm i playwright in a scratch dir, run from there with this path).
// Env: BASE (default http://127.0.0.1:8777), OUT (screenshot dir), FAKE_AUDIO (WAV of English speech), PHOTO (jpeg).
// Usage: node web/e2e/recorder-probe.mjs [chromium|webkit]
// Does MediaRecorder output decode + re-render to 16 kHz WAV in this engine (same steps as liveVoiceAgent)?
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// Resolve Playwright from the current directory, so web/ needs no extra dependency.
const pw = await import(pathToFileURL(createRequire(`${process.cwd()}/`).resolve('playwright')).href);
const { chromium, webkit } = pw.chromium ? pw : pw.default;
const engine = process.argv[2] === 'chromium' ? chromium : webkit;
const browser = await engine.launch({ headless: true });
const ctx = await browser.newContext({ permissions: process.argv[2] === 'chromium' ? ['microphone'] : [] });
const page = await ctx.newPage();
page.on('console', (m) => console.log('console:', m.type(), m.text()));
await page.goto((process.env.BASE || 'http://127.0.0.1:8777') + '/app/');
const out = await page.evaluate(async () => {
  const r = { ua: navigator.userAgent, hasMR: typeof MediaRecorder !== 'undefined' };
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const osc = ac.createOscillator();
  const dest = ac.createMediaStreamDestination();
  osc.connect(dest); osc.start();
  try {
    r.gum = await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => `ok ${s.getAudioTracks().length} track(s)`, (e) => `err ${e.name}`);
  } catch (e) { r.gum = 'throw ' + e; }
  r.types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg'].filter((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(new MediaStream(dest.stream.getAudioTracks()));
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (rec.onstop = res));
  rec.start();
  await new Promise((res) => setTimeout(res, 2000));
  rec.stop(); await stopped;
  r.mimeType = rec.mimeType;
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  r.size = blob.size;
  try {
    const ctx2 = new AC();
    const decoded = await ctx2.decodeAudioData(await blob.arrayBuffer());
    r.decoded = { duration: decoded.duration, rate: decoded.sampleRate };
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const rendered = await off.startRendering();
    r.rendered = rendered.length;
  } catch (e) { r.err = `${e.name}: ${e.message}`; }
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
