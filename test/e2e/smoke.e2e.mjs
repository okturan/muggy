import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, acceptInsecureCerts: true, args: ['--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 900, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
await page.goto('https://127.0.0.1:8787/tirana', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
const info = await page.evaluate(() => ({
  title: document.getElementById('title').textContent,
  blurb: document.getElementById('blurb').textContent,
  air: document.getElementById('comfort').textContent,
  airLabel: document.querySelector('.stat.comfort .k').textContent,
  outInIt: !document.getElementById('strainCard').hidden,
  factors: [...document.querySelectorAll('#factors .factor')].map((li) => li.getAttribute('aria-label')),
  strainNote: document.getElementById('strainNote').textContent,
  strainSub: document.getElementById('strainSub').textContent,
  normal: !document.getElementById('normalCard').hidden && `${document.getElementById('normalVerdict').textContent} | ${document.getElementById('normalSub').textContent} | ${document.getElementById('normalNote').textContent}`,
  relief: !document.getElementById('windowCard').hidden && `${document.getElementById('windowWhen').textContent} | ${document.getElementById('windowSub').textContent} | ${document.getElementById('windowNote').textContent}`,
  docTitle: document.title,
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/private/tmp/claude-501/-Users-okan-code-weather-app/b99fab50-a03c-4101-b0aa-a14666581ada/scratchpad/tirana-top.png', fullPage: true });
// keyboard: focus the Why button, press Enter, check focus inside, Escape, focus returns
await page.focus('#whyBtn');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 300));
const opened = await page.evaluate(() => ({ open: document.getElementById('whySheet').open, active: document.activeElement.id, sections: [...document.querySelectorAll('#whyBody section h3')].map((h) => h.textContent) }));
await page.screenshot({ path: '/private/tmp/claude-501/-Users-okan-code-weather-app/b99fab50-a03c-4101-b0aa-a14666581ada/scratchpad/tirana-why.png' });
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
const closed = await page.evaluate(() => ({ open: document.getElementById('whySheet').open, active: document.activeElement.id }));
console.log('why sheet:', JSON.stringify(opened), '→ after Escape:', JSON.stringify(closed));
console.log('console problems:', errors.length ? errors.join('\n') : 'none');
await browser.close();
