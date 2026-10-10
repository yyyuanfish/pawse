// Browser walkthrough (Playwright, headless). Not part of check.sh: needs a running backend serving /app
// and Playwright installed outside web/ (e.g. npm i playwright in a scratch dir, run from there with this path).
// Env: BASE (default http://127.0.0.1:8777), OUT (screenshot dir), FAKE_AUDIO (WAV of English speech), PHOTO (jpeg).
// Usage: node web/e2e/live-path.mjs [chromium|webkit]
// Live path: /app/?live=1 against the backend on :8777 (real Gemini when the server has a key).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// Resolve Playwright from the current directory, so web/ needs no extra dependency.
const pw = await import(pathToFileURL(createRequire(`${process.cwd()}/`).resolve('playwright')).href);
const { chromium, webkit } = pw.chromium ? pw : pw.default;

const BASE = process.env.BASE || 'http://127.0.0.1:8777';
const OUT = process.env.OUT || 'e2e-shots';
const name = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const engine = name === 'webkit' ? webkit : chromium;
const failures = [];
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failures.push(m); };
const args = name === 'chromium' ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + (process.env.FAKE_AUDIO || 'speech.wav')] : [];
const browser = await engine.launch({ headless: true, args });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, locale: 'en-US', geolocation: { latitude: 47.3769, longitude: 8.5417 },
  permissions: name === 'chromium' ? ['geolocation', 'microphone', 'camera'] : ['geolocation'],
});
const page = await ctx.newPage();
const errors = [];
const api = [];
page.on('console', (m) => m.type() === 'error' && !/status of 429/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.url().includes('/api/') && api.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));
const shot = (s) => page.screenshot({ path: `${OUT}/${name}-live-${s}.png`, fullPage: true });

// Default ?live=1 uses Gemini Live; LIVE_QS='?live=1&voice=rest' tests the REST turn-based agent.
await page.goto(`${BASE}/app/${process.env.LIVE_QS || '?live=1&voice=rest'}`);
await page.getByRole('button', { name: 'Call Pawse' }).click();
await page.getByRole('button', { name: 'Agree and start' }).click({ timeout: 5000 }).catch(() => {});
await page.getByRole('button', { name: 'Microphone' }).click(); // mic starts off in live mode
await page.locator('.cap-ai, .cap-user').first().waitFor({ timeout: 30000 });

// 1. mic -> transcription -> triage
if (name === 'chromium') {
  await page.locator('.cap-user').waitFor({ timeout: 60000 }).catch(() => {});
  const heard = (await page.locator('.cap-user').count()) ? await page.locator('.cap-user').innerText() : '';
  check(/limp/i.test(heard), `[${name}] mic speech transcribed: "${heard}"`);
  await shot('1-mic-transcript');
  await page.locator('.sheet').waitFor({ timeout: 60000 }).catch(() => {});
  check(await page.locator('.sheet').isVisible(), `[${name}] triage sheet after spoken turn`);
  if (await page.locator('.sheet').isVisible()) {
    console.log('   triage:', (await page.locator('.level-title').innerText()), '|', (await page.locator('.steps li').allInnerTexts()).slice(0, 3).join(' / '));
    await shot('2-mic-triage');
    await page.getByRole('button', { name: 'Keep talking' }).click();
  }
} else {
  await page.waitForTimeout(3000);
  const cap = await page.locator('.cap-error').allInnerTexts();
  check(cap.length > 0, `[${name}] no-recorder state is explained: ${JSON.stringify(cap)}`);
  await shot('1-mic-state');
}

// 2. photo upload + typed text
const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Send photo' }).click();
await (await chooser).setFiles(process.env.PHOTO || 'cat.jpg');
await page.getByText('Photo sent to Pawse').waitFor({ timeout: 10000 }).catch(() => {});
check(await page.getByText('Photo sent to Pawse').isVisible(), `[${name}] photo acknowledged`);
const before = api.filter((a) => /care\/requests|agents\/runs/.test(a)).length;
await page.getByPlaceholder('Or type here…').fill('She jumped off the wardrobe and now limps on her front left leg');
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.waitForFunction((n) => true, before);
const t0 = Date.now();
while (api.filter((a) => /care\/requests|agents\/runs/.test(a)).length <= before && Date.now() - t0 < 60000) await page.waitForTimeout(250);
check(api.filter((a) => /care\/requests|agents\/runs/.test(a)).slice(before).some((a) => / 20\d$/.test(a)), `[${name}] typed text (+photo) -> care request ok`);
await page.locator('.sheet').waitFor({ timeout: 30000 }).catch(() => {});
check(await page.locator('.sheet').isVisible(), `[${name}] triage sheet after typed turn`);
await shot('3-typed-triage');

// 3. clinic search
await page.locator('.sheet .action-row').first().getByRole('button').click();
await page.locator('.clinic-empty, .clinic:not(.skeleton)').first().waitFor({ timeout: 30000 });
const clinicText = await page.locator('main.clinics').innerText();
console.log('   clinics:', clinicText.replace(/\s+/g, ' ').slice(0, 300));
check((await page.locator('.clinic:not(.skeleton)').count()) > 0 || (await page.getByRole('button', { name: 'Try again' }).count()) > 0, `[${name}] clinic list or clear error with retry`);
await shot('4-clinics');
await page.getByRole('button', { name: 'Back' }).click();

// 4. phone calls (plan page). No clinic provider key here, so stub ONE clinic response to reach the live vet call.
await page.route('**/api/v1/care/requests', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  if (!body.share_location) return route.continue();
  await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ clinics: [{ id: 'stub-1', name: 'Stub Kleintierpraxis (test)', address: 'Teststrasse 1, 8001 Zürich', location: { lat: 47.372, lng: 8.54 }, open_now: true }] }) });
});
for (const [i, label] of [[0, 'vet'], [1, 'insurer']]) {
  await page.locator('.plan .action-row').nth(i).getByRole('button').click();
  if (i === 0) {
    // vet goes through the clinic list; without clinics we can't pick one
    await page.locator('.clinic-empty, .clinic:not(.skeleton)').first().waitFor({ timeout: 30000 });
    if (!(await page.locator('.clinic:not(.skeleton)').count())) { console.log('   (no clinics: vet call not reachable live)'); await page.getByRole('button', { name: 'Back' }).click(); continue; }
    await page.locator('.clinic:not(.skeleton)').first().getByRole('button', { name: /call|prepare/i }).click();
  }
  // Live phone = honest handoff page (draft + dialer, no call placed); the scripted call is the rehearsal.
  const handoff = page.locator('main.handoff');
  if (await handoff.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
    check(/No call has been placed/.test(await handoff.innerText()), `[${name}] ${label} handoff says no call was placed`);
    await shot(`5-${label}-handoff`);
    await page.getByRole('button', { name: /simulated Mimi phone rehearsal/i }).click();
  }
  await page.locator('.result-card, .pc-error').first().waitFor({ timeout: 120000 });
  check(await page.locator('.result-card').isVisible(), `[${name}] ${label} call reached a result`);
  check((await page.locator('.result-card .sim-badge').count()) === 1, `[${name}] ${label} result labelled simulated`);
  check((await page.locator('.line-callee .sim-badge').count()) === (await page.locator('.line-callee').count()), `[${name}] every ${label} callee line labelled simulated`);
  if (label === 'insurer') { const t = await page.locator('.result-card').innerText(); check(t.includes('240') && t.includes('360'), `[${name}] insurer 240/360`); }
  await shot(`5-${label}-call`);
  await page.getByRole('button', { name: 'Back to Pawse' }).click();
}
await shot('6-plan');
console.log('   api:', api.join(' | '));
check(errors.length === 0, `[${name}] console errors: ${JSON.stringify(errors)}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
