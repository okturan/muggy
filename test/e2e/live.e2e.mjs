// Real-data smoke against a live deployment: no interception, real APIs.
// Usage: MUGGY_BASE=https://muggy.fyi node test/e2e/live.e2e.mjs [city-slug ...]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MUGGY_BASE || 'https://muggy.fyi';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['tirana', 'singapore', 'reykjavik', 'dubai', 'sydney'];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
let failed = 0;
try {
  for (const slug of slugs) {
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 900, deviceScaleFactor: 2 });
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2500));
    const s = await page.evaluate(() => {
      const t = (id) => (document.getElementById(id) || {}).textContent || '';
      const vis = (id) => !document.getElementById(id).hidden;
      return {
        place: t('placeName'), headline: t('title'), blurb: t('blurb'), air: t('comfort'),
        outInIt: vis('strainCard') ? `${t('strainSub')} | ${t('strainNote')}` : '(hidden)',
        normal: vis('normalCard') ? `${t('normalSub')} | ${t('normalNote')}` : '(hidden)',
        relief: vis('windowCard') ? `${t('windowWhen')} · ${t('windowSub')} | ${t('windowNote')}` : '(hidden)',
        stray: /Infinity|NaN|undefined/.test(document.getElementById('app').textContent),
        hiddenOk: [...document.querySelectorAll('[hidden]')].every((el) => getComputedStyle(el).display === 'none'),
      };
    });
    await page.screenshot({ path: join(SHOTS, `live-${slug}.png`), fullPage: true });
    const ok = problems.length === 0 && !s.stray && s.hiddenOk && s.headline && s.blurb;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${slug}: ${s.place} — ${s.headline}\n      ${s.blurb}\n      out in it: ${s.outInIt}\n      normal: ${s.normal}\n      relief: ${s.relief}${problems.length ? `\n      PROBLEMS: ${problems.join(' | ')}` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
