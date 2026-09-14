// Sweeps the heat-load engine over a dense grid of plausible weather and records
// every combination the verdict can be asked to compose:
// texture × shade level × sun level × day/night × sun known.
//
// Usage: node tools/reachability.mjs   → test/fixtures/reachable.json
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wbgtInterval, rhFromDewPoint } from '../public/lib/load.js';
import { textureOf } from '../public/lib/texture.js';
import { levelOf } from '../public/lib/levels.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const moments = [
  { label: 'noon', endMs: Date.parse('2026-08-01T03:00:00Z'), minutes: 60, lat: 35.68, lon: 139.69 },
  { label: 'dawn', endMs: Date.parse('2026-08-01T20:00:00Z'), minutes: 60, lat: 35.68, lon: 139.69 },
  { label: 'night', endMs: Date.parse('2026-08-01T15:00:00Z'), minutes: 60, lat: 35.68, lon: 139.69 },
  { label: 'desert noon', endMs: Date.parse('2026-06-21T09:00:00Z'), minutes: 60, lat: 24.47, lon: 54.37 },
];
const seen = new Map();
const note = (t, example) => { const k = `${t.texture}|${t.shadeLevel}|${t.sunLevel}|${t.isDay}|${t.sunKnown}`; if (!seen.has(k)) seen.set(k, { ...t, example }); };

let n = 0;
for (const m of moments) {
  for (let T = -5; T <= 50; T += 1) {
    for (let td = -15; td <= Math.min(T, 32); td += 1) {
      const rh = Math.min(100, rhFromDewPoint(T, td));
      for (const wind10 of [0, 1.5, 4, 10]) {
        for (const sw of [0, 150, 450, 800, 1000]) {
          const o = wbgtInterval({ ...m, tair: T, rh, wind10, pres: 1008, sw, direct: 0.8 * sw });
          if (!o) continue;
          n++;
          const texture = textureOf(td);
          const example = { moment: m.label, T, td, wind10, sw };
          note({ texture, shadeLevel: levelOf(o.shade), sunLevel: levelOf(o.sun), isDay: o.sunUp, sunKnown: true }, example);
          // Radiation missing: sun unknown in daylight.
          note({ texture, shadeLevel: levelOf(o.shade), sunLevel: null, isDay: o.sunUp, sunKnown: false }, example);
        }
      }
    }
    // Load unavailable (no temperature): texture only.
  }
}
for (const texture of ['dry', 'comfortable', 'humid', 'muggy', 'oppressive', 'miserable']) {
  for (const isDay of [true, false]) note({ texture, shadeLevel: null, sunLevel: null, isDay, sunKnown: false }, { unavailable: true });
}

const tuples = [...seen.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
writeFileSync(join(ROOT, 'test', 'fixtures', 'reachable.json'), `${JSON.stringify({ evaluations: n, tuples }, null, 1)}\n`);
console.log(`${n} evaluations, ${tuples.length} reachable combinations`);
