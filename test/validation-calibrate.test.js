// Calibration must never see held-out measurements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingRows, selectConfig } from '../tools/wbgt-validation/calibrate.mjs';
import { assignSplit } from '../tools/wbgt-validation/dataset.mjs';

const COLUMNS = ['no', 'split', 'time', 'WBGT', 'Tw', 'Tg', 'T', 'RH', 'W', 'P', 'sw', 'dir', 'sw1', 'dir1'];
const stations = { 1: { lat: 35.68, lon: 139.69 }, 2: { lat: 34.68, lon: 135.52 } };

function dataset(heldOutValue) {
  const rows = [];
  for (let h = 6; h <= 18; h++) {
    const time = `2025-08-01T${String(h).padStart(2, '0')}:00`;
    rows.push([1, 'train', time, 27 + (h % 3), 24, 38, 31, 60, 10, 1005, 600, 450, 620, 470]);
    rows.push([2, 'heldout', time, heldOutValue, heldOutValue, heldOutValue, 31, 60, 10, 1005, 600, 450, 620, 470]);
  }
  return { columns: COLUMNS, rows, stations };
}

test('trainingRows drops every held-out row before anything else sees it', () => {
  const rows = trainingRows(dataset(Number.NaN));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.split === 'train' && r.no === 1));
});

test('the chosen configuration is identical whatever the held-out measurements are', () => {
  const grid = { surfaceAlbedo: [0.2, 0.45], minWind2: [0.13, 1], timing: ['preceding'] };
  const a = selectConfig(trainingRows(dataset(Number.NaN)), stations, grid);
  const b = selectConfig(trainingRows(dataset(99)), stations, grid);
  assert.deepEqual(a.chosen, b.chosen);
  assert.ok(Number.isFinite(a.chosen.mae));
});

test('station split is deterministic, stratified, and puts about 40% of each group aside', () => {
  const list = [
    ...[14163, 34392, 44132, 51106, 54232, 62078, 67437, 82182, 88317, 91197].map((no) => ({ no, measuredFrom: '2014-04-01' })),
    ...Array.from({ length: 39 }, (_, i) => ({ no: 40000 + i, measuredFrom: '2025-04-01' })),
  ];
  const s1 = assignSplit(list);
  const s2 = assignSplit([...list].reverse());
  for (const st of list) assert.equal(s1.get(st.no), s2.get(st.no));
  const long = list.filter((s) => s.measuredFrom < '2024').filter((s) => s1.get(s.no) === 'heldout').length;
  const short = list.filter((s) => s.measuredFrom >= '2024').filter((s) => s1.get(s.no) === 'heldout').length;
  assert.equal(long, 4);
  assert.equal(short, 16);
});
