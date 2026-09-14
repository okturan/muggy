// Downloads the validation data for Muggy's heat-load engine:
//   1. Japan MOE measured WBGT (6-inch black globe) for every station that
//      measures it, from the public getSurveyData API;
//   2. the Open-Meteo historical forecast inputs the app would have seen at
//      the same place and hour.
//
// Usage: node tools/wbgt-validation/fetch.mjs [moe|inputs|all]
// Resumable: existing files are skipped. Raw data stays in data/ (git-ignored).
import { mkdirSync, existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW = join(ROOT, 'data', 'raw');
const MASTER_URL = 'https://www.wbgt.env.go.jp/man15NH/wbgt_point_master-20260515.csv';
const MOE_API = 'https://www.wbgt.env.go.jp/api/v1/getSurveyData';
const OM_API = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
const HOURLY = [
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'wind_speed_10m', 'surface_pressure',
  'shortwave_radiation', 'direct_radiation', 'diffuse_radiation', 'is_day',
].join(',');
const FIRST_YEAR = 2022; // Open-Meteo historical forecasts begin in 2022
const SEASON = ['05-01', '09-30'];
const HEADERS = { 'user-agent': 'muggy.fyi WBGT validation (https://muggy.fyi/about)' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => { console.log(msg); appendFileSync(join(RAW, 'fetch.log'), `${new Date().toISOString()} ${msg}\n`); };

async function getText(url, { tries = 4 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return await r.text();
      if (r.status >= 400 && r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
      throw new Error(`HTTP ${r.status}`);
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(2000 * 2 ** i);
    }
  }
}

/** Station master → the stations with a measured (black globe) period. */
async function stations() {
  const path = join(RAW, 'stations.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const csv = (await getText(MASTER_URL)).replace(/^﻿/, '');
  writeFileSync(join(RAW, 'point_master.csv'), csv);
  const rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(',').map((s) => s.trim()));
  const out = rows
    .filter((c) => c[14])
    .map((c) => ({
      no: Number(c[2]),
      name: c[5],
      lat: Number(c[7]) + Number(c[8]) / 60,
      lon: Number(c[9]) + Number(c[10]) / 60,
      measuredFrom: c[14],
      measuredTo: c[15] || '9999-12-31',
    }));
  if (out.some((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !s.no)) {
    throw new Error('station master did not parse cleanly');
  }
  writeFileSync(path, JSON.stringify(out, null, 2));
  return out;
}

/** May-September windows from 2022, clipped to the measured period and to yesterday. */
function seasons(st) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const out = [];
  const thisYear = new Date().getUTCFullYear();
  for (let y = FIRST_YEAR; y <= thisYear; y++) {
    const from = [`${y}-${SEASON[0]}`, st.measuredFrom].sort().at(-1);
    const to = [`${y}-${SEASON[1]}`, st.measuredTo.replace(/^9999-99-99$/, '9999-12-31'), yesterday].sort()[0];
    if (from <= to) out.push({ year: y, from, to });
  }
  return out;
}

async function fetchMoe(list) {
  mkdirSync(join(RAW, 'moe'), { recursive: true });
  for (const st of list) {
    for (const s of seasons(st)) {
      const file = join(RAW, 'moe', `${st.no}_${s.year}.json`);
      if (existsSync(file)) continue;
      const url = `${MOE_API}?data_type=1&location_type=1&wbgt_nos=${st.no}`
        + `&date_from=${s.from.replace(/-/g, '')}000000&date_to=${s.to.replace(/-/g, '')}230000`;
      try {
        const body = await getText(url);
        const j = JSON.parse(body);
        if (j.status !== 'success') throw new Error(j.errMsg || 'status not success');
        writeFileSync(file, body);
        log(`moe ${st.no} ${st.name} ${s.year}: ${j.count} rows`);
      } catch (err) {
        log(`moe ${st.no} ${st.name} ${s.year}: FAILED ${err.message}`);
      }
      await sleep(1500);
    }
  }
}

async function fetchInputs(list) {
  mkdirSync(join(RAW, 'inputs'), { recursive: true });
  for (const st of list) {
    for (const s of seasons(st)) {
      const file = join(RAW, 'inputs', `${st.no}_${s.year}.json`);
      if (existsSync(file)) continue;
      const url = `${OM_API}?latitude=${st.lat.toFixed(4)}&longitude=${st.lon.toFixed(4)}`
        + `&start_date=${s.from}&end_date=${s.to}&hourly=${HOURLY}&timezone=Asia%2FTokyo`;
      try {
        const body = await getText(url);
        const j = JSON.parse(body);
        if (!j.hourly || !j.hourly.time) throw new Error(j.reason || 'no hourly data');
        writeFileSync(file, body);
        log(`inputs ${st.no} ${st.name} ${s.year}: ${j.hourly.time.length} hours (grid ${j.latitude},${j.longitude} elev ${j.elevation})`);
      } catch (err) {
        log(`inputs ${st.no} ${st.name} ${s.year}: FAILED ${err.message}`);
      }
      await sleep(700);
    }
  }
}

const what = process.argv[2] || 'all';
mkdirSync(RAW, { recursive: true });
const list = await stations();
log(`${list.length} measured stations`);
if (what === 'moe' || what === 'all') await fetchMoe(list);
if (what === 'inputs' || what === 'all') await fetchInputs(list);
log('done');
