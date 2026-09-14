// Generates test/fixtures/wbgt-grid.json: a deterministic grid of inputs run
// through the Argonne reference oracle (build it first with verify.sh).
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'test', 'fixtures', 'wbgt-grid.json');

// Mulberry32: small, seeded, reproducible.
let seed = 0x5eed2026;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + (b - a) * rand();
const r2 = (x) => Math.round(x * 100) / 100;

const LATS = [-45, -23.4, 0, 1.35, 23.4, 35.7, 41.33, 51.5, 60, 64.1];
const COLS = ['year', 'month', 'day', 'hour', 'minute', 'avg', 'lat', 'lon', 'solar', 'pres',
  'tair', 'rh', 'speed', 'zspeed', 'dT', 'urban', 'fdir'];
const cases = [];

// Broad random coverage.
for (let n = 0; n < 17000; n++) {
  const solar = rand() < 0.25 ? 0 : r2(between(0, 1100));
  cases.push({
    year: 2026 + Math.floor(rand() * 6), month: 1 + Math.floor(rand() * 12), day: 1 + Math.floor(rand() * 28),
    hour: Math.floor(rand() * 24), minute: pick([0, 15, 30, 45]), avg: pick([15, 60]),
    lat: pick(LATS), lon: r2(between(-180, 180)), solar, pres: r2(between(850, 1035)),
    tair: r2(between(10, 48)), rh: r2(between(5, 100)),
    speed: rand() < 0.1 ? 0 : r2(between(0, 15)), zspeed: rand() < 0.8 ? 10 : 2,
    dT: pick([-1, 1]), urban: pick([0, 1]), fdir: rand() < 0.3 ? -1 : r2(between(0, 0.9)),
  });
}

// Dense sunrise and sunset sweeps: 5-minute steps, low irradiance, both fdir modes.
for (const lat of [0, 41.33, 60]) {
  for (const [month, day] of [[3, 20], [6, 21], [9, 13], [12, 21]]) {
    for (let mins = 0; mins < 24 * 60; mins += 5) {
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;
      // Only keep the two hours around each solar horizon crossing (roughly),
      // using the time zone of the longitude 0 meridian.
      const h = mins / 60;
      if (!((h > 3 && h < 9) || (h > 15 && h < 21))) continue;
      if (rand() > 0.35) continue;
      cases.push({
        year: 2026, month, day, hour, minute, avg: pick([15, 60]), lat, lon: 0,
        solar: r2(between(0, 180)), pres: 1010, tair: r2(between(12, 30)), rh: r2(between(40, 95)),
        speed: r2(between(0.5, 4)), zspeed: 10, dT: pick([-1, 1]), urban: 1,
        fdir: rand() < 0.5 ? -1 : r2(between(0, 0.9)),
      });
    }
  }
}

const csv = cases.map((c, id) => [id, c.year, c.month, c.day, c.hour, c.minute, 0, c.avg, c.lat, c.lon,
  c.solar, c.pres, c.tair, c.rh, c.speed, c.zspeed, c.dT, c.urban, c.fdir].join(',')).join('\n') + '\n';

const run = spawnSync(join(here, 'build', 'oracle'), { input: csv, maxBuffer: 64 * 1024 * 1024 });
if (run.status !== 0) {
  console.error(run.stderr.toString());
  throw new Error('oracle failed; run tools/wbgt-oracle/verify.sh first');
}
const outRows = run.stdout.toString().trim().split('\n').slice(1).map((l) => l.split(',').map(Number));
if (outRows.length !== cases.length) throw new Error(`oracle returned ${outRows.length} of ${cases.length} rows`);

const rows = outRows.map((o) => {
  const c = cases[o[0]];
  return [...COLS.map((k) => c[k]), o[1], o[2], o[3], o[4], o[5], o[6]];
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  about: 'Liljegren WBGT reference outputs from the unmodified Argonne source via tools/wbgt-oracle. gmt = 0 (UTC). fdir -1 = model estimate.',
  columns: [...COLS, 'status', 'Tg', 'Tnwb', 'Tpsy', 'Twbg', 'est_speed'],
  rows,
}));
const failed = rows.filter((r) => r[COLS.length] !== 0).length;
console.log(`wrote ${rows.length} cases (${failed} non-converged) to ${out}`);
