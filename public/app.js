/* Muggy — dew point → comfort band, with a buddy who feels it. */
(() => {
  'use strict';

  // WeatherSpark bands (55/60/65/70/75 °F) expressed in °C.
  const BANDS = [
    { id: 'dry',         max: 12.8 },
    { id: 'comfortable', max: 15.6 },
    { id: 'humid',       max: 18.3 },
    { id: 'muggy',       max: 21.1 },
    { id: 'oppressive',  max: 23.9 },
    { id: 'miserable',   max: Infinity },
  ];
  const RANK = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
  const COPY = {
    dry:         ['Crisp and dry',   'The air is dry. Lips and skin will feel it — drink water, wear the sweater.'],
    comfortable: ['Perfect air',     'The air is right in the sweet spot. Go outside, you deserve it.'],
    humid:       ['A little sticky', "The air is a bit humid. You'll notice it, but it's fine. Light layers."],
    muggy:       ["It's muggy out",  'The air is muggy. Shirts will stick a little — go light and find the shade.'],
    oppressive:  ['Oppressive',      "The air is heavy. Sweat won't dry — slow down, drink lots, stay near a fan."],
    miserable:   ['Miserable',       'The air is brutal. Honestly, stay in. Find the AC and wait it out.'],
  };
  const DEFAULT_PLACE = { name: 'Tirana', lat: 41.33, lon: 19.82 };

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const els = {
    placeName: $('placeName'), levelName: $('levelName'), timeChip: $('timeChip'),
    title: $('title'), blurb: $('blurb'), temp: $('temp'), hum: $('hum'), comfort: $('comfort'),
    hours: $('hours'), hoursSub: $('hoursSub'), week: $('week'), weekSub: $('weekSub'),
    sheet: $('sheet'), q: $('q'), results: $('results'), toast: $('toast'),
  };

  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem('muggy:prefs') || '{}'); } catch { return {}; }
  })();
  const savePrefs = () => { try { localStorage.setItem('muggy:prefs', JSON.stringify(prefs)); } catch {} };

  const qs = new URLSearchParams(location.search);
  let unit = (qs.get('unit') || prefs.unit) === 'f' ? 'f' : 'c';
  let buddy = (qs.get('buddy') || prefs.buddy) === 'boy' ? 'boy' : 'cloud';
  let data = null;

  const levelOf = (dpC) => BANDS.find((b) => dpC < b.max).id;
  const fmtTemp = (c) => (c == null ? '–' : `${Math.round(unit === 'f' ? c * 9 / 5 + 32 : c)}°`);
  const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  const hourLabel = (iso) => iso.slice(11, 13);

  function toast(msg, ms = 2600) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => els.toast.classList.remove('is-on'), ms);
  }

  function applyPrefUI() {
    app.dataset.buddy = buddy;
    document.querySelectorAll('.units button').forEach((b) => b.classList.toggle('is-on', b.dataset.unit === unit));
    document.querySelectorAll('.buddies button').forEach((b) => b.classList.toggle('is-on', b.dataset.buddy === buddy));
  }

  // ---------- render ----------
  function render() {
    if (!data) return;
    const { current: cur, hourly: h } = data;
    const now = levelOf(cur.dew_point_2m);
    app.dataset.level = now;
    app.dataset.state = 'ready';
    els.levelName.textContent = now;
    els.timeChip.textContent = `now · ${cur.time.slice(11, 16)}`;
    els.title.textContent = COPY[now][0];
    els.blurb.textContent = COPY[now][1];
    els.temp.textContent = fmtTemp(cur.temperature_2m);
    els.hum.textContent = cur.relative_humidity_2m == null ? '–' : `${Math.round(cur.relative_humidity_2m)}%`;
    els.comfort.textContent = now;

    // Hours: from the current hour, next 24.
    const curHour = cur.time.slice(0, 13);
    let start = h.time.findIndex((t) => t.slice(0, 13) === curHour);
    if (start < 0) start = 0;
    const slice = [];
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
      slice.push({ t: h.time[i], dp: h.dew_point_2m[i], temp: h.temperature_2m[i] });
    }
    const valid = slice.filter((x) => x.dp != null);
    const peak = valid.reduce((a, b) => (b.dp > a.dp ? b : a), valid[0]);
    els.hours.innerHTML = slice.map((x, i) => {
      const lv = x.dp == null ? 'comfortable' : levelOf(x.dp);
      return `<div class="hour${i === 0 ? ' is-now' : ''}" data-level="${lv}" title="${lv}">
        <span class="t">${i === 0 ? 'now' : hourLabel(x.t)}</span><span class="dot"></span><span class="d">${fmtTemp(x.temp)}</span></div>`;
    }).join('');
    els.hoursSub.textContent = peak ? `stickiest around ${hourLabel(peak.t)}:00 (${levelOf(peak.dp)})` : '';

    // Week: one row per local date, a 24-segment band bar (from dew point) and the day's high temperature.
    const days = new Map();
    h.time.forEach((t, i) => {
      const d = t.slice(0, 10);
      if (!days.has(d)) days.set(d, { dps: [], temps: [] });
      days.get(d).dps.push(h.dew_point_2m[i]);
      days.get(d).temps.push(h.temperature_2m[i]);
    });
    const todayKey = cur.time.slice(0, 10);
    const rows = [...days.entries()].filter(([d, o]) => d >= todayKey && o.dps.some((v) => v != null)).slice(0, 7);
    let stickyDays = 0; let worst = null;
    els.week.innerHTML = rows.map(([d, { dps, temps }]) => {
      const vals = dps.filter((v) => v != null);
      const max = Math.max(...vals);
      const hi = Math.max(...temps.filter((v) => v != null));
      const lvMax = levelOf(max);
      if (RANK[lvMax] >= RANK.muggy) stickyDays++;
      if (!worst || max > worst.max) worst = { d, max };
      const segs = dps.map((v) => `<i data-level="${v == null ? 'comfortable' : levelOf(v)}" style="--lc:var(--c-${v == null ? 'comfortable' : levelOf(v)})"></i>`).join('');
      return `<div class="day" title="${lvMax}"><span class="n display">${d === todayKey ? 'Today' : dayName(d)}</span>
        <div class="bar">${segs}</div><span class="d">${fmtTemp(hi)}</span></div>`;
    }).join('');
    els.weekSub.textContent = stickyDays
      ? `${stickyDays} of ${rows.length} day${rows.length === 1 ? '' : 's'} muggy or worse`
      : 'nothing sticky ahead';
  }

  // ---------- data ----------
  async function load(place) {
    app.dataset.state = 'loading';
    els.placeName.textContent = place.name;
    try {
      const r = await fetch(`/api/forecast?lat=${place.lat}&lon=${place.lon}`);
      if (!r.ok) throw new Error(`forecast ${r.status}`);
      data = await r.json();
      if (!data.current || data.current.dew_point_2m == null) throw new Error('no dew point');
      prefs.place = place; savePrefs();
      render();
    } catch (err) {
      console.error(err);
      app.dataset.state = 'error';
      els.title.textContent = 'Could not read the sky.';
      els.blurb.textContent = 'The weather service did not answer. Pull down or try again in a moment.';
      toast('Weather service unavailable');
    }
  }

  function locate({ silent } = {}) {
    if (!navigator.geolocation) { if (!silent) toast('Location is not available here'); return Promise.resolve(false); }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          load({ name: 'My location', lat: +lat.toFixed(3), lon: +lon.toFixed(3), geo: true });
          resolve(true);
        },
        () => { if (!silent) toast('Could not get your location'); resolve(false); },
        { timeout: 8000, maximumAge: 600000 },
      );
    });
  }

  // ---------- search sheet ----------
  let searchT = null;
  function renderResults(list, emptyMsg) {
    if (!list.length) { els.results.innerHTML = emptyMsg ? `<li class="empty">${emptyMsg}</li>` : ''; return; }
    els.results.innerHTML = list.map((p, i) => `<li><button type="button" data-i="${i}">
      <span class="nm">${esc(p.name)}</span><span class="ad">${esc([p.admin, p.country].filter(Boolean).join(', '))}</span></button></li>`).join('');
    els.results.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const p = list[+b.dataset.i];
      els.sheet.close();
      load({ name: p.name, lat: p.lat, lon: p.lon });
    }));
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  els.q.addEventListener('input', () => {
    clearTimeout(searchT);
    const q = els.q.value.trim();
    if (q.length < 2) { renderResults([]); return; }
    searchT = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (els.q.value.trim() !== q) return;
        renderResults(j.results || [], 'No matches — try a bigger town nearby.');
      } catch { renderResults([], 'Search is unavailable right now.'); }
    }, 280);
  });
  $('placeBtn').addEventListener('click', () => { els.sheet.showModal(); els.q.value = ''; renderResults([]); setTimeout(() => els.q.focus(), 50); });
  $('geoBtn').addEventListener('click', async () => { els.sheet.close(); locate(); });
  els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) els.sheet.close(); });

  // ---------- toggles ----------
  document.querySelectorAll('.units button').forEach((b) => b.addEventListener('click', () => {
    unit = b.dataset.unit; prefs.unit = unit; savePrefs(); applyPrefUI(); render();
  }));
  document.querySelectorAll('.buddies button').forEach((b) => b.addEventListener('click', () => {
    buddy = b.dataset.buddy; prefs.buddy = buddy; savePrefs(); applyPrefUI();
  }));

  // ---------- boot ----------
  applyPrefUI();
  (async () => {
    if (prefs.place && Number.isFinite(prefs.place.lat)) {
      load(prefs.place);
      if (prefs.place.geo) locate({ silent: true }); // refresh silently if they were on GPS
      return;
    }
    const ok = await locate({ silent: true });
    if (!ok) { load(DEFAULT_PLACE); toast('Showing Tirana — tap the name to change'); }
  })();

  // Refresh when coming back to the tab after a while.
  let hidden = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hidden = Date.now();
    else if (hidden && Date.now() - hidden > 15 * 60000 && prefs.place) load(prefs.place);
  });
})();
