// Builds the aligned validation dataset from the raw downloads:
// MOE measured hours (black globe observed, all inputs observed) joined to the
// Open-Meteo historical forecast inputs at the same station and JST hour.
//
// Usage: node tools/wbgt-validation/dataset.mjs
// Output: data/dataset.json (git-ignored) and a per-station summary on stdout.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'data', 'dataset.json');
const HELD_OUT_SHARE = 0.4;
const LONG_RECORD_BEFORE = '2024-01-01';

/** FNV-1a, 32-bit: a deterministic, order-free way to shuffle stations. */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Train / held-out assignment, stratified by record length, fixed by station number alone. */
export function assignSplit(stations) {
  const out = new Map();
  const groups = [
    stations.filter((s) => s.measuredFrom < LONG_RECORD_BEFORE),
    stations.filter((s) => s.measuredFrom >= LONG_RECORD_BEFORE),
  ];
  for (const g of groups) {
    const sorted = [...g].sort((a, b) => fnv1a(String(a.no)) - fnv1a(String(b.no)));
    const k = Math.round(sorted.length * HELD_OUT_SHARE);
    sorted.forEach((s, i) => out.set(s.no, i < k ? 'heldout' : 'train'));
  }
  return out;
}

const COLUMNS = ['no', 'split', 'time', 'WBGT', 'Tw', 'Tg', 'T', 'RH', 'W', 'P', 'sw', 'dir', 'sw1', 'dir1'];

function main() {
  const stations = JSON.parse(readFileSync(join(RAW, 'stations.json'), 'utf8'));
  const split = assignSplit(stations);
  const rows = [];
  const meta = {};
  const missing = [];

  for (const st of stations) {
    const years = [];
    for (let y = 2022; y <= new Date().getUTCFullYear(); y++) {
      const moeF = join(RAW, 'moe', `${st.no}_${y}.json`);
      const inF = join(RAW, 'inputs', `${st.no}_${y}.json`);
      if (!existsSync(moeF) && !existsSync(inF)) continue;
      if (!existsSync(moeF) || !existsSync(inF)) { missing.push(`${st.no} ${st.name} ${y}: ${existsSync(moeF) ? 'inputs' : 'moe'} missing`); continue; }
      years.push(y);
      const moe = JSON.parse(readFileSync(moeF, 'utf8')).data;
      const om = JSON.parse(readFileSync(inF, 'utf8'));
      meta[st.no] = { name: st.name, lat: om.latitude, lon: om.longitude, stationLat: st.lat, stationLon: st.lon, elevation: om.elevation };
      const h = om.hourly;
      const idx = new Map(h.time.map((t, i) => [t, i]));
      for (const r of moe) {
        if (r.wbgt_class !== 1 || Number(r.wbgt_WI) !== 4) continue;
        const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):\d{2}:\d{2}$/.exec(r.wbgt_date);
        if (!m) continue;
        const key = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:00`;
        const i = idx.get(key);
        if (i == null || i + 1 >= h.time.length) continue;
        const vals = [h.temperature_2m[i], h.relative_humidity_2m[i], h.wind_speed_10m[i], h.surface_pressure[i],
          h.shortwave_radiation[i], h.direct_radiation[i], h.shortwave_radiation[i + 1], h.direct_radiation[i + 1]];
        const meas = [Number(r.wbgt_WO), Number(r.wbgt_Tw), Number(r.wbgt_Tg)];
        if (vals.some((v) => v == null || !Number.isFinite(v)) || meas.some((v) => !Number.isFinite(v))) continue;
        rows.push([st.no, split.get(st.no), key, ...meas, ...vals]);
      }
    }
    if (years.length) meta[st.no].years = years;
  }

  const bySt = {};
  for (const r of rows) bySt[r[0]] = (bySt[r[0]] || 0) + 1;
  const inBoth = Object.keys(meta).filter((no) => rows.some((r) => r[0] === +no && r[1] === 'train') && rows.some((r) => r[0] === +no && r[1] === 'heldout'));
  if (inBoth.length) throw new Error(`stations in both splits: ${inBoth.join(', ')}`);

  writeFileSync(OUT, JSON.stringify({ columns: COLUMNS, utcOffsetSeconds: 32400, stations: meta, rows }));
  for (const s of ['train', 'heldout']) {
    const nos = Object.keys(meta).filter((no) => split.get(+no) === s);
    console.log(`${s}: ${nos.length} stations, ${rows.filter((r) => r[1] === s).length} hours`);
    for (const no of nos) console.log(`  ${no} ${meta[no].name.padEnd(12)} ${String(bySt[no] || 0).padStart(6)} h  ${meta[no].years.join(',')}`);
  }
  if (missing.length) console.log(`missing files:\n  ${missing.join('\n  ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
