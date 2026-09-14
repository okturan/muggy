// The JavaScript port must reproduce the Argonne reference implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcWbgt } from '../public/lib/wbgt.js';

const grid = JSON.parse(readFileSync(new URL('./fixtures/wbgt-grid.json', import.meta.url), 'utf8'));
const col = Object.fromEntries(grid.columns.map((c, i) => [c, i]));
const TOL = 0.1;

test(`port matches the Argonne oracle within ${TOL} °C on ${grid.rows.length} cases`, () => {
  let worst = { d: 0 };
  const failures = [];
  for (const r of grid.rows) {
    const input = {
      year: r[col.year], month: r[col.month], day: r[col.day], hour: r[col.hour], minute: r[col.minute],
      gmt: 0, avg: r[col.avg], lat: r[col.lat], lon: r[col.lon], solar: r[col.solar], pres: r[col.pres],
      tair: r[col.tair], rh: r[col.rh], speed: r[col.speed], zspeed: r[col.zspeed], dT: r[col.dT],
      urban: r[col.urban], fdir: r[col.fdir] >= 0 ? r[col.fdir] : undefined,
    };
    const out = calcWbgt(input);
    const refOk = r[col.status] === 0;
    const gotOk = out && out.Twbg != null;
    if (refOk !== gotOk) {
      // Non-convergence right at the iteration cap can flip between float and
      // double arithmetic; record it, but it must stay rare.
      failures.push({ kind: 'status', input, ref: r[col.status], got: out });
      continue;
    }
    if (!refOk) continue;
    for (const [k, ref] of [['Tg', r[col.Tg]], ['Tnwb', r[col.Tnwb]], ['Twbg', r[col.Twbg]]]) {
      const d = Math.abs(out[k] - ref);
      if (d > worst.d) worst = { d, k, input, ref, got: out[k] };
      if (d > TOL) failures.push({ kind: k, d, input, ref, got: out[k] });
    }
  }
  const statusFlips = failures.filter((f) => f.kind === 'status').length;
  const valueFails = failures.filter((f) => f.kind !== 'status');
  assert.equal(valueFails.length, 0,
    `${valueFails.length} values off by more than ${TOL} °C; first: ${JSON.stringify(valueFails[0])}`);
  assert.ok(statusFlips <= grid.rows.length * 0.001,
    `${statusFlips} convergence disagreements; first: ${JSON.stringify(failures.find((f) => f.kind === 'status'))}`);
  console.log(`worst difference ${worst.d.toFixed(4)} °C (${worst.k}); convergence disagreements: ${statusFlips}`);
});
