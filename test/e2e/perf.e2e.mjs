// Performance budget: on a phone-class CPU (4× throttled), the heat-load work
// for one render (current reading, 7-day hourly series, factor breakdown)
// takes under 50 ms, including the cold first render with empty caches.
// Needs `npx wrangler dev --local-protocol https --port 8787` running.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.MUGGY_BASE || 'https://127.0.0.1:8787';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BUDGET_MS = 50;
const fx = JSON.parse(readFileSync(new URL('./fixtures/split-noon.json', import.meta.url), 'utf8'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, acceptInsecureCerts: true, args: ['--ignore-certificate-errors'] });
let failed = false;
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument((fixedMs) => {
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...a) { if (a.length) super(...a); else super(fixedMs); }
      static now() { return fixedMs; }
    };
  }, fx.nowMs);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const path = new URL(req.url()).pathname;
    const reply = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (path === '/api/forecast') return reply(fx.data);
    if (path === '/api/normals') return reply(fx.normals);
    if (path === '/api/geocode') return reply({ results: [{ name: 'Tirana', lat: fx.place.lat, lon: fx.place.lon }] });
    if (path === '/api/whereami') return reply({ city: 'Tirana', lat: fx.place.lat, lon: fx.place.lon });
    if (req.url().includes('bigdatacloud')) return req.abort();
    return req.continue();
  });
  await page.goto(`${BASE}/tirana`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => performance.getEntriesByName('muggy:load').length > 0, { timeout: 30000 });
  const spans = await page.evaluate(() => performance.getEntriesByName('muggy:load').map((e) => e.duration));
  const worst = Math.max(...spans);
  console.log(`hours in fixture: ${fx.data.hourly.time.length}; renders measured: ${spans.length}; durations ms: ${spans.map((d) => d.toFixed(1)).join(', ')}`);
  failed = !(worst < BUDGET_MS);
  console.log(`${failed ? 'FAIL' : 'ok  '} heat-load work under ${BUDGET_MS} ms at 4× CPU throttle (worst ${worst.toFixed(1)} ms)`);
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
