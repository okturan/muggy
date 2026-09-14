// About page: the explorer shows what the shared engine says, and is keyboard-operable.
// Needs `npx wrangler dev --local-protocol https --port 8787` running.
import puppeteer from 'puppeteer-core';
import { explore } from '../../public/lib/explorer.js';

const BASE = process.env.MUGGY_BASE || 'https://127.0.0.1:8787';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok: !!ok, detail });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, acceptInsecureCerts: true, args: ['--ignore-certificate-errors'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 900 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('xHeadline').textContent !== '…', { timeout: 20000 });

  const cases = [
    { tair: 24, texture: 'muggy', sun: 'full', wind: 'breeze' },
    { tair: 34, texture: 'dry', sun: 'full', wind: 'still' },
    { tair: 27, texture: 'oppressive', sun: 'none', wind: 'still' },
    { tair: 41, texture: 'humid', sun: 'some', wind: 'windy' },
  ];
  for (const c of cases) {
    const shown = await page.evaluate((o) => {
      const t = document.getElementById('xTemp'); t.value = String(o.tair); t.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('xAir').value = o.texture;
      document.querySelector(`input[name=xSun][value=${o.sun}]`).checked = true;
      document.querySelector(`input[name=xWind][value=${o.wind}]`).checked = true;
      document.getElementById('explorer').dispatchEvent(new Event('change', { bubbles: true }));
      return { headline: document.getElementById('xHeadline').textContent, blurb: document.getElementById('xBlurb').textContent };
    }, c);
    const expected = explore(c).verdict;
    check(`explorer ${JSON.stringify(c)} matches the engine`, shown.headline === expected.headline && shown.blurb === expected.blurb, `${shown.headline} vs ${expected.headline}`);
  }

  // Keyboard: tab from the top until every explorer control has had focus.
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle0' });
  const wanted = new Set(['xTemp', 'xAir', 'xSun', 'xWind']);
  const reached = new Set();
  for (let i = 0; i < 80 && reached.size < wanted.size; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => { const a = document.activeElement; return a.id || (a.name || ''); });
    if (wanted.has(id)) reached.add(id);
  }
  check('every explorer control is reachable by Tab', reached.size === wanted.size, [...reached].join(','));
  // Change the temperature with the keyboard and confirm the live result updates.
  await page.focus('#xTemp');
  const before = await page.evaluate(() => document.getElementById('xTempValue').textContent);
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => ({ v: document.getElementById('xTempValue').textContent, live: document.getElementById('xResult').getAttribute('aria-live') }));
  check('arrow keys change the temperature and the result is a live region', before !== after.v && after.live === 'polite', `${before} → ${after.v}, aria-live=${after.live}`);
  check('no console errors on the About page', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
}
let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label}${r.ok ? '' : ` :: ${r.detail}`}`); }
console.log(`\n${results.length - failed}/${results.length} About checks passed`);
if (failed) process.exitCode = 1;
