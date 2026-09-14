// Compares the untouched Argonne demo output with the oracle driver's output
// for the same sample rows. Exits non-zero on any disagreement.
import { readFileSync } from 'node:fs';

const [demoPath, oraclePath] = process.argv.slice(2);
const demo = readFileSync(demoPath, 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
const oracle = readFileSync(oraclePath, 'utf8').trim().split('\n').slice(1)
  .map((l) => l.split(',').map(Number))
  .reduce((by, r) => { by[r[0]] = { status: r[1], Tg: r[2], Tnwb: r[3], Tpsy: r[4], Twbg: r[5], est: r[6] }; return by; }, {});

let bad = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (label, a, b, tol) => {
  if (!near(a, b, tol)) { bad++; console.error(`MISMATCH ${label}: ${a} vs ${b}`); }
};

demo.forEach((d, n) => {
  // demo columns: dayfrac Twbg Twbg2 Tg Tg2 Tnwb Tnwb2 Tpsy u2m est_speed
  const [, Twbg, Twbg2, Tg, Tg2, Tnwb, Tnwb2, Tpsy, , est] = d;
  const two = oracle[n * 4];
  const ten = oracle[n * 4 + 1];
  // The demo prints two decimals; allow its rounding.
  check(`row ${n} 2m Twbg`, two.Twbg, Twbg, 0.0051);
  check(`row ${n} 2m Tg`, two.Tg, Tg, 0.0051);
  check(`row ${n} 2m Tnwb`, two.Tnwb, Tnwb, 0.0051);
  check(`row ${n} 10m Twbg`, ten.Twbg, Twbg2, 0.0051);
  check(`row ${n} 10m Tg`, ten.Tg, Tg2, 0.0051);
  check(`row ${n} 10m Tnwb`, ten.Tnwb, Tnwb2, 0.0051);
  check(`row ${n} 10m Tpsy`, ten.Tpsy, Tpsy, 0.0051);
  check(`row ${n} 10m est_speed`, ten.est, est, 0.0051);
  // Restated path must be identical to the original call.
  for (const k of ['status', 'Tg', 'Tnwb', 'Tpsy', 'Twbg', 'est']) {
    check(`row ${n} restated 2m ${k}`, oracle[n * 4 + 2][k], two[k], 0);
    check(`row ${n} restated 10m ${k}`, oracle[n * 4 + 3][k], ten[k], 0);
  }
});

if (bad) { console.error(`${bad} mismatches`); process.exit(1); }
console.log(`oracle agrees with the original demo on ${demo.length} rows (2 m, 10 m, restated)`);
