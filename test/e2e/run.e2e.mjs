// Browser tests for the main screen, driven by the named fixtures.
//
// Needs `npx wrangler dev --local-protocol https --port 8787` running.
// Usage: node test/e2e/run.e2e.mjs [fixture-name ...]
// Env: MUGGY_BASE (default https://127.0.0.1:8787), CHROME (executable path).
import puppeteer from 'puppeteer-core';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.MUGGY_BASE || 'https://127.0.0.1:8787';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = join(HERE, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const only = process.argv.slice(2);
const fixtures = readdirSync(join(HERE, 'fixtures')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(HERE, 'fixtures', f), 'utf8')))
  .filter((fx) => !only.length || only.includes(fx.name));

const results = [];
const check = (fx, label, ok, detail = '') => results.push({ fixture: fx, label, ok: !!ok, detail });

async function openFixture(browser, fx) {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 900, deviceScaleFactor: 2 });
  await page.setBypassServiceWorker(true);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.evaluateOnNewDocument((fixedMs) => {
    const RealDate = Date;
    let offset = 0;
    window.__setClock = (ms) => { offset = ms - fixedMs; };
    window.Date = class extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(fixedMs + offset); }
      static now() { return fixedMs + offset; }
    };
    const ticks = [];
    const realSetInterval = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...rest) => (ms === 60000 ? (ticks.push(fn), 0) : realSetInterval(fn, ms, ...rest));
    window.__tickMinute = () => ticks.forEach((f) => f());
    try { localStorage.clear(); } catch { /* fresh profile */ }
  }, fx.nowMs);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    const reply = (body, status = 200, headers = {}) => req.respond({ status, contentType: 'application/json', headers: { 'x-muggy-cache': 'fresh', ...headers }, body: JSON.stringify(body) });
    if (url.pathname === '/api/forecast') return reply(fx.data);
    if (url.pathname === '/api/normals') return fx.normals ? reply(fx.normals) : reply({ error: 'none' }, 503);
    if (url.pathname === '/api/geocode') return reply({ results: [{ name: fx.place.name, lat: fx.place.lat, lon: fx.place.lon, admin: '', country: 'Albania', population: 400000, fc: 'PPLC' }] });
    if (url.pathname === '/api/whereami') return reply({ city: fx.place.name, lat: fx.place.lat, lon: fx.place.lon });
    if (url.hostname.endsWith('bigdatacloud.net')) return req.abort();
    return req.continue();
  });
  await page.goto(`${BASE}/tirana`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', { timeout: 30000 });
  return { page, problems };
}

/** Texts and phrase classes of everything the verdict-bearing elements say. */
const snapshot = (page) => page.evaluate(async () => {
  const { classesIn } = await import('/lib/lexicon.js');
  const text = (id) => (document.getElementById(id) || {}).textContent || '';
  const visible = (id) => !document.getElementById(id).hidden;
  const out = {
    headline: text('title'), blurb: text('blurb'), air: text('comfort'), airLabel: document.querySelector('.stat.comfort .k').textContent,
    strainVisible: visible('strainCard'), strainSub: text('strainSub'), strainNote: text('strainNote'),
    factorsText: text('factorsText'), doors: visible('doors') ? `${text('doorShade')} / ${text('doorSun')}` : null,
    normalVisible: visible('normalCard'), normalSub: text('normalSub'), normalNote: text('normalNote'), normalVerdict: text('normalVerdict'),
    reliefVisible: visible('windowCard'), reliefWhen: text('windowWhen'), reliefSub: text('windowSub'), reliefNote: text('windowNote'),
    hoursSub: text('hoursSub'), weekSub: text('weekSub'), whyVisible: visible('whyBtn'), docTitle: document.title,
    hiddenReallyHidden: [...document.querySelectorAll('[hidden]')].every((el) => getComputedStyle(el).display === 'none'),
    bodyText: document.getElementById('app').textContent,
  };
  const sentences = `${out.blurb}`.split(/(?<=[.!?])\s+/).filter(Boolean);
  out.blurbClasses = sentences.map((s) => ({ s, c: [...classesIn(s)] }));
  out.verdictClasses = [...classesIn(`${out.headline} ${out.blurb}`)];
  out.subClasses = [...classesIn(`${out.hoursSub} ${out.weekSub}`)];
  out.allClasses = [...classesIn([out.headline, out.blurb, out.strainNote, out.strainSub, out.reliefNote].join(' '))];
  return out;
});

async function whySheet(page) {
  await page.focus('#whyBtn');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 250));
  const open = await page.evaluate(() => ({
    open: document.getElementById('whySheet').open, active: document.activeElement.id,
    sections: [...document.querySelectorAll('#whyBody section h3')].map((h) => h.textContent),
    text: document.getElementById('whyBody').textContent,
  }));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));
  const closed = await page.evaluate(() => ({ open: document.getElementById('whySheet').open, active: document.activeElement.id }));
  return { open, closed };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, acceptInsecureCerts: true, args: ['--ignore-certificate-errors'] });
try {
  for (const fx of fixtures) {
    const { page, problems } = await openFixture(browser, fx);
    const s = await snapshot(page);
    const e = fx.expect;
    await page.screenshot({ path: join(SHOTS, `${fx.name}.png`), fullPage: true });

    // Common to every screen.
    check(fx.name, 'no console errors', problems.length === 0, problems.join(' | '));
    check(fx.name, 'headline equals the shared verdict', s.headline === e.headline, `${s.headline} vs ${e.headline}`);
    check(fx.name, 'blurb equals the shared verdict', s.blurb === e.blurb, `${s.blurb} vs ${e.blurb}`);
    check(fx.name, 'tile labelled Air shows the texture', s.airLabel === 'Air' && s.air === e.texture, `${s.airLabel}: ${s.air}`);
    const slows = s.blurbClasses.some((b) => b.c.includes('pace') || b.c.includes('avoidExertion'));
    const bareReassure = s.blurbClasses.some((b) => b.c.includes('reassurance') && !/^Under cover/.test(b.s));
    check(fx.name, 'no advice to slow down beside unqualified reassurance', !(slows && bareReassure), s.blurb);
    check(fx.name, 'hours and week sub-headings carry no load words', !s.subClasses.includes('loadLevel'), `${s.hoursSub} | ${s.weekSub}`);
    check(fx.name, 'title carries the headline', s.docTitle.startsWith(e.headline), s.docTitle);
    check(fx.name, 'hidden cards are not displayed', s.hiddenReallyHidden);
    check(fx.name, 'no Infinity, NaN or undefined on screen', !/Infinity|NaN|undefined/.test(s.bodyText));
    check(fx.name, 'no double spaces in the blurb', !/\s{2,}/.test(s.blurb), s.blurb);
    if (e.sunUp === false || e.sunKnown === false) check(fx.name, 'no sun or shade words without a known daytime sun', !s.verdictClasses.includes('sunShade'), `${s.headline} | ${s.blurb}`);
    if (e.relief) check(fx.name, 'relief card matches the shared relief', s.reliefVisible && s.reliefWhen === e.relief.when && s.reliefNote === e.relief.note, `${s.reliefWhen} | ${s.reliefNote}`);
    if (s.normalVisible) {
      const pcts = [...new Set(`${s.normalSub} ${s.normalNote}`.match(/\d+%/g) || [])].map((p) => parseInt(p, 10));
      check(fx.name, 'normals: one statistic (and its complement) only', pcts.length <= 2 && (pcts.length < 2 || pcts[0] + pcts[1] === 100), `${s.normalSub} | ${s.normalNote}`);
    }

    // Scenario-specific.
    if (fx.name === 'tirana-2026-09-13-1030') {
      check(fx.name, 'normals card shown for the morning', s.normalVisible && /mornings/.test(s.normalSub), s.normalSub);
    }
    if (fx.name === 'muggy-mild-dawn') {
      check(fx.name, 'muggy but mild', s.headline === 'Muggy but mild');
      check(fx.name, 'the card says what is causing it', s.strainVisible && /Most of this is|share this|air temperature/.test(s.factorsText), s.factorsText);
    }
    if (fx.name === 'split-noon') {
      check(fx.name, 'split headline names shade and sun', /in the shade/.test(s.headline) && /in the sun/.test(s.headline), s.headline);
      check(fx.name, 'small print gives shade and sun WBGT', /shade/.test(s.strainSub) && /sun/.test(s.strainSub), s.strainSub);
      check(fx.name, 'the sun is named as the cause', /sun/.test(s.factorsText), s.factorsText);
      check(fx.name, 'two doors show the held shade and sun levels', s.doors === `${e.shadeLevel === 'realWork' ? 'heavy' : e.shadeLevel} / ${e.sunLevel === 'realWork' ? 'heavy' : e.sunLevel}`, s.doors);
      const w = await whySheet(page);
      check(fx.name, 'why sheet opens with focus inside', w.open.open && w.open.active === 'whyClose', JSON.stringify(w.open.active));
      check(fx.name, 'why sheet explains shade and sun', w.open.sections.includes('Shade and sun'), w.open.sections.join(', '));
      // The sheet prints exact values; the small print prints them rounded (and
      // clamped into a held level's range, in which case the sheet says so).
      const sheetRounded = [...w.open.text.matchAll(/(\d+\.\d) °C/g)].map((m) => Math.floor(Number(m[1]) + 0.5));
      const onLine = /right on the line/.test(w.open.text);
      check(fx.name, 'why sheet numbers match the small print', (s.strainSub.match(/\d+/g) || []).every((n) => sheetRounded.includes(Number(n)) || onLine), `${s.strainSub} vs ${sheetRounded.join(',')}`);
      check(fx.name, 'Escape closes and returns focus', !w.closed.open && w.closed.active === 'whyBtn', JSON.stringify(w.closed));
    }
    if (fx.name === 'dry-heat-danger') {
      check(fx.name, 'danger without the texture word', /dangerous/i.test(s.headline) && !/\bdry\b/i.test(s.headline), s.headline);
    }
    if (fx.name === 'missing-radiation') {
      check(fx.name, 'no split and no sun small print', !/in the sun/.test(s.headline) && !/sun/.test(s.strainSub), `${s.headline} | ${s.strainSub}`);
      check(fx.name, 'no doors without a known sun', s.doors === null, s.doors);
    }
    if (fx.name === 'no-temperature') {
      check(fx.name, 'texture-only; Out in it and Why hidden', !s.strainVisible && !s.whyVisible, `${s.strainVisible} ${s.whyVisible}`);
    }
    if (fx.name === 'boundary-hysteresis') {
      const seen = [];
      for (let m = 1; m <= 60; m++) {
        await page.evaluate((ms) => { window.__setClock(ms); window.__tickMinute(); }, fx.nowMs + m * 60000);
        seen.push(await page.evaluate(() => document.getElementById('title').textContent));
      }
      const changes = seen.filter((h, i) => i && h !== seen[i - 1]).length;
      check(fx.name, `raw level flips ${fx.rawFlips} times in the hour, headline does not`, changes === 0, [...new Set(seen)].join(' / '));
    }
    await page.close();
  }

  // Offline after one visit, with the real worker and the service worker on.
  if (!only.length || only.includes('offline')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 900 });
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(`${BASE}/tirana`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', { timeout: 30000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', { timeout: 30000 });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const offline = await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', { timeout: 20000 }).then(() => true).catch(() => false);
    const headline = await page.evaluate(() => document.getElementById('title').textContent);
    results.push({ fixture: 'offline', label: 'renders offline after one visit', ok: offline && problems.length === 0, detail: `${headline} ${problems.join(' | ')}` });
    await page.close();
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.fixture.padEnd(24)} ${r.label}${r.ok ? '' : ` :: ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed; screenshots in ${SHOTS}`);
if (failed) process.exitCode = 1;
