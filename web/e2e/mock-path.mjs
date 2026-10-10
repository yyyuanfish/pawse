// Browser walkthrough (Playwright, headless). Not part of check.sh: needs a running backend serving /app
// and Playwright installed outside web/ (e.g. npm i playwright in a scratch dir, run from there with this path).
// Env: BASE (default http://127.0.0.1:8777), OUT (screenshot dir), FAKE_AUDIO (WAV of English speech), PHOTO (jpeg).
// Usage: node web/e2e/mock-path.mjs [chromium|webkit]
// Mock path walkthrough: /app/?speed=3, desktop + phone viewport, chromium or webkit.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// Resolve Playwright from the current directory, so web/ needs no extra dependency.
const pw = await import(pathToFileURL(createRequire(`${process.cwd()}/`).resolve('playwright')).href);
const { chromium, webkit } = pw.chromium ? pw : pw.default;

const BASE = process.env.BASE || 'http://127.0.0.1:8777';
const OUT = process.env.OUT || 'e2e-shots';
const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const name = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const failures = [];
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures.push(msg); };

const args = name === 'chromium' ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + (process.env.FAKE_AUDIO || 'speech.wav')] : [];
const browser = await engine.launch({ headless: true, args });

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({
    viewport, locale: 'en-US', geolocation: { latitude: 47.3769, longitude: 8.5417 },
    permissions: name === 'chromium' ? ['geolocation', 'microphone', 'camera'] : ['geolocation'],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (s) => {
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check(noHScroll, `[${name}/${label}] no horizontal scroll on ${s}`);
    await page.screenshot({ path: `${OUT}/${name}-mock-${label}-${s}.png`, fullPage: true });
  };

  await page.goto(`${BASE}/app/?speed=3`);
  await page.getByRole('button', { name: 'Call Pawse' }).waitFor();
  check(await page.getByText('Demo mode').isVisible(), `[${name}/${label}] demo-mode badge on home`);
  await shot('1-home');
  await page.getByRole('button', { name: 'Call Pawse' }).click();
  await page.locator('.cap-ai').waitFor({ timeout: 15000 });
  await shot('2-voice');
  await page.locator('.sheet').waitFor({ timeout: 30000 });
  check(/vet/i.test(await page.locator('.level-title').innerText()), `[${name}/${label}] triage card shows a vet headline`);
  await shot('3-triage');

  await page.locator('.sheet .action-row').first().getByRole('button').click();
  await page.locator('.clinic').first().waitFor({ timeout: 15000 });
  check((await page.locator('.clinic').count()) >= 3, `[${name}/${label}] clinic list has clinics`);
  await shot('4-clinics');
  await page.locator('.clinic').first().getByRole('button', { name: /call/i }).click();
  await page.locator('.result-card').waitFor({ timeout: 60000 });
  const vetCard = await page.locator('.result-card').innerText();
  const vetHead = await page.locator('.result-card h3').innerText();
  check(vetCard.includes('16:30'), `[${name}/${label}] vet result shows 16:30`);
  check(!/booked/i.test(vetHead), `[${name}/${label}] vet result does not claim "booked"`);
  check((await page.locator('.result-card .sim-badge').count()) === 1, `[${name}/${label}] vet result is labelled simulated`);
  check((await page.locator('.line-callee .sim-badge').count()) > 0, `[${name}/${label}] vet callee lines labelled simulated`);
  await shot('5-vet-call');
  await page.getByRole('button', { name: 'Back to Pawse' }).click();

  await page.locator('.plan').waitFor();
  check(!/booked/i.test(await page.locator('.plan').innerText()), `[${name}/${label}] plan does not claim "booked"`);
  await page.locator('.plan .action-row').nth(1).getByRole('button').click();
  await page.locator('.result-card').waitFor({ timeout: 60000 });
  const insCard = await page.locator('.result-card').innerText();
  check(insCard.includes('240') && insCard.includes('360'), `[${name}/${label}] insurer result shows 240 back / 360 to pay`);
  check((await page.locator('.result-card .sim-badge').count()) === 1, `[${name}/${label}] insurer result is labelled simulated`);
  check((await page.locator('.line-callee .sim-badge').count()) > 0, `[${name}/${label}] insurer callee lines labelled simulated`);
  await shot('6-insurer-call');
  await page.getByRole('button', { name: 'Back to Pawse' }).click();
  await page.locator('.plan .summary').waitFor();
  const summary = await page.locator('.plan .summary').innerText();
  check(summary.includes('16:30') && summary.includes('360'), `[${name}/${label}] summary has 16:30 and 360`);
  await shot('7-summary');
  check(errors.length === 0, `[${name}/${label}] no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
