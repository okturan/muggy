// Everything under public/lib is shared with the Cloudflare Worker, so it must
// load and run without a browser: no window, document, storage or navigator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = fileURLToPath(new URL('../public/lib/', import.meta.url));
const BROWSER_ONLY = /\b(window|document|localStorage|sessionStorage|navigator|location)\s*[.[]/;

const files = (() => {
  try { return readdirSync(LIB).filter((f) => f.endsWith('.js')); } catch { return []; }
})();

test('public/lib exists and has modules', () => {
  assert.ok(files.length > 0, 'expected modules in public/lib');
});

for (const f of files) {
  test(`${f} uses no browser-only globals`, () => {
    const src = readFileSync(join(LIB, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const hit = src.match(BROWSER_ONLY);
    assert.equal(hit, null, `${f} references ${hit && hit[0]}`);
  });

  test(`${f} imports cleanly in plain Node`, async () => {
    await import(pathToFileURL(join(LIB, f)).href);
  });
}
