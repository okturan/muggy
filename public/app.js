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
  /**
   * Headline and blurb per band.
   *
   * These describe how well sweat evaporates, which is what the dew point
   * actually measures — never how warm it is. A low dew point happens at 40°
   * in a desert just as readily as at 2° in winter, so any advice that assumes
   * a temperature has to read the temperature (see `blurbFor`).
   */
  const COPY = {
    dry:         ['Crisp and dry',   'Sweat evaporates the moment it forms.'],
    comfortable: ['Perfect air',     'Nothing to plan around — this is about as good as air gets.'],
    humid:       ['A little sticky', "You'll notice it, but it stays out of your way. Something light and breathable is plenty."],
    muggy:       ["It's muggy out",  'Shirts start sticking. Keep to the shade and take it slower than usual.'],
    oppressive:  ['Oppressive',      'Sweat stops evaporating, so you stop cooling down. Slow everything down and keep water on you.'],
    miserable:   ['Miserable',       'The air cannot hold any more water, so sweating barely works. Stay in and find air conditioning.'],
  };

  /** Dry air says nothing about warmth, so this is the one band that must ask. */
  function blurbFor(band, tempC) {
    if (band !== 'dry' || tempC == null) return COPY[band][1];
    if (tempC < 10) return `${COPY.dry[1]} Cold and dry — the kind that chaps lips. Drink more than you feel like.`;
    if (tempC > 28) return `${COPY.dry[1]} Dry heat: you will not feel yourself sweating, which is exactly why to keep drinking.`;
    return `${COPY.dry[1]} Easy air — your skin will notice before you do.`;
  }
  const DEFAULT_PLACE = { name: 'Tirana', lat: 41.33, lon: 19.82 };

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const els = {
    placeName: $('placeName'), levelName: $('levelName'), timeChip: $('timeChip'),
    title: $('title'), blurb: $('blurb'), temp: $('temp'), hum: $('hum'), comfort: $('comfort'),
    hours: $('hours'), hoursSub: $('hoursSub'), week: $('week'), weekSub: $('weekSub'),
    sheet: $('sheet'), q: $('q'), results: $('results'), toast: $('toast'),
    normalCard: $('normalCard'), normalSub: $('normalSub'), normalVerdict: $('normalVerdict'),
    normalNote: $('normalNote'), mixBar: $('mixBar'),
    windowCard: $('windowCard'), windowSub: $('windowSub'), windowWhen: $('windowWhen'), windowNote: $('windowNote'),
  };

  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem('muggy:prefs') || '{}'); } catch { return {}; }
  })();
  const savePrefs = () => { try { localStorage.setItem('muggy:prefs', JSON.stringify(prefs)); } catch {} };

  const qs = new URLSearchParams(location.search);
  let unit = (qs.get('unit') || prefs.unit) === 'f' ? 'f' : 'c';
  let buddy = (qs.get('buddy') || prefs.buddy) === 'boy' ? 'boy' : 'cloud';
  let data = null;
  let normals = null;   // climatology for this place and date, or null while loading/unavailable

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

  // ---------- is this normal? ----------
  /** Percentile of x within a 101-point quantile ladder. */
  function pctOf(q, x) {
    if (!q || !q.length) return null;
    if (x <= q[0]) return 0;
    if (x >= q[100]) return 100;
    let lo = 0, hi = 100;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (q[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function renderNormals() {
    if (!normals || !data) { els.normalCard.hidden = true; return; }
    const dp = data.current.dew_point_2m;
    const pct = pctOf(normals.q, dp);
    if (pct == null) { els.normalCard.hidden = true; return; }
    const nowBand = levelOf(dp);
    const share = normals.mix[nowBand] || 0;

    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    els.normalVerdict.textContent =
      pct >= 90 ? 'Way stickier than usual'
      : pct >= 70 ? 'Stickier than usual'
      : pct > 30 ? 'About normal'
      : pct > 10 ? 'Drier than usual'
      : 'Way drier than usual';

    // How unusual, as a count of hours rather than a percentile — "only 21% have
    // been stickier" lands where "79th percentile" does not.
    const rarer = 100 - pct;
    const position =
      rarer <= 1 ? 'Nothing recorded around this date has been stickier.'
      : pct <= 1 ? 'Nothing recorded around this date has been drier.'
      : pct >= 50 ? `Only ${rarer}% of hours around this date have been stickier.`
      : `Only ${pct}% of hours around this date have been drier.`;

    // The band alone cannot say "normal band, top of it" — which is exactly the
    // common case, and reads as a contradiction next to "stickier than usual".
    const context =
      share === 0 ? `${cap(nowBand)} air has never been recorded here around this date.`
      : share < 0.05 ? `${cap(nowBand)} air turns up only about ${Math.round(share * 100)}% of the time around now.`
      : nowBand !== normals.medianBand ? `Usually it is ${normals.medianBand} around now.`
      : pct >= 65 ? `Still the usual ${nowBand} band — but at the sticky end of it.`
      : pct <= 35 ? `Still the usual ${nowBand} band — at the easier end of it.`
      : 'Squarely normal for here.';

    els.normalNote.textContent = `${position} ${context}`;

    // Rank today against every individual past day around this date, so the
    // claim is day-against-day rather than a day against a smoothed average.
    const past = normals.days;
    const todayVals = data.hourly.time
      .map((t, i) => (t.slice(0, 10) === data.current.time.slice(0, 10) ? data.hourly.dew_point_2m[i] : null))
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    if (past && past.length >= 30 && todayVals.length) {
      const todayMid = todayVals[Math.floor(todayVals.length / 2)];
      const frac = past.filter((v) => todayMid > v).length / past.length;
      els.normalSub.textContent =
        frac >= 0.98 ? `stickiest in ${normals.years} years`
        : frac <= 0.02 ? `driest in ${normals.years} years`
        : frac >= 0.5 ? `stickier than ${Math.round(frac * 100)}% of days`
        : `drier than ${Math.round((1 - frac) * 100)}% of days`;
    } else {
      els.normalSub.textContent = `${normals.years} years of history`;
    }

    // Segments sized by each band's share of past hours, so the marker at the
    // current percentile necessarily lands inside today's band.
    const segs = BANDS
      .filter((b) => (normals.mix[b.id] || 0) > 0)
      .map((b) => `<i style="flex-grow:${(normals.mix[b.id] * 1000).toFixed(0)};background:var(--c-${b.id})" title="${b.id} ${Math.round(normals.mix[b.id] * 100)}%"></i>`)
      .join('');
    els.mixBar.innerHTML = `${segs}<span class="marker" style="left:${pct}%"></span>`;
    els.normalCard.hidden = false;
  }

  // ---------- when to go out ----------
  /** Usable daylight hours on one local date, from index `from` onward. */
  function daylightHours(h, from, dateKey) {
    const out = [];
    for (let i = from; i < h.time.length; i++) {
      const day = h.time[i].slice(0, 10);
      if (day < dateKey) continue;
      if (day > dateKey) break;
      const hr = +h.time[i].slice(11, 13);
      const dp = h.dew_point_2m[i];
      if (dp == null || hr < 7 || hr > 21) continue;
      out.push({ i, t: h.time[i], rank: RANK[levelOf(dp)] });
    }
    return out;
  }

  /**
   * The best stretch of daylight to be outside in.
   *
   * Today wins by default: being told to wait until tomorrow is useless advice
   * while there is still daylight left. Only once today is done does it look
   * ahead. It also reports whether the "window" actually is one — a band that
   * holds all day is a description of the weather, not a recommendation.
   */
  function bestWindow() {
    const { current: cur, hourly: h } = data;
    const curHour = cur.time.slice(0, 13);
    let start = h.time.findIndex((t) => t.slice(0, 13) === curHour);
    if (start < 0) start = 0;

    const todayKey = cur.time.slice(0, 10);
    let pool = daylightHours(h, start, todayKey);
    let day = 'today';
    if (!pool.length) {
      const nextKey = h.time.map((t) => t.slice(0, 10)).find((d) => d > todayKey);
      if (!nextKey) return null;
      pool = daylightHours(h, start, nextKey);
      day = 'tomorrow';
    }
    if (!pool.length) return null;

    const bestRank = Math.min(...pool.map((c) => c.rank));
    let run = null; let best = null;
    for (const c of pool) {
      if (c.rank !== bestRank) { run = null; continue; }
      // Night hours are skipped, so runs must be contiguous by index, not position.
      if (run && c.i === run.endI + 1) { run.endI = c.i; run.len++; }
      else run = { startI: c.i, endI: c.i, start: c.t, len: 1 };
      if (!best || run.len > best.len) best = { ...run };
    }
    if (!best) return null;

    return {
      band: BANDS[bestRank].id,
      bestRank,
      day,
      start: best.start,
      end: h.time[best.endI],
      len: best.len,
      startsNow: day === 'today' && best.startI === start,
      // Nothing to choose between. A band holding most of the day is the weather,
      // not a window — pointing at "07:00-18:00" is no help to anyone.
      flat: pool.length <= 2 || best.len >= pool.length * 0.7,
      curBand: levelOf(cur.dew_point_2m),
      curRank: RANK[levelOf(cur.dew_point_2m)],
    };
  }

  function renderWindow() {
    const w = bestWindow();
    if (!w) { els.windowCard.hidden = true; return; }

    // Tint the panel with the window's own band, not the current one — this card
    // is about the air you are being sent out into.
    const panel = els.windowCard.querySelector('.panel');
    if (panel) panel.style.background = `var(--c-${w.band})`;

    const when = w.len === 1
      ? `Around ${hourLabel(w.start)}:00`
      : `${hourLabel(w.start)}:00 – ${String((+hourLabel(w.end) + 1) % 24).padStart(2, '0')}:00`;
    const better = w.bestRank < w.curRank;

    if (w.startsNow && w.flat) {
      els.windowWhen.textContent = 'Right now';
      els.windowSub.textContent = 'as good as it gets';
      els.windowNote.textContent = `It stays ${w.band} for the rest of the day — waiting will not help.`;
    } else if (w.day === 'today' && !w.flat) {
      els.windowWhen.textContent = when;
      els.windowSub.textContent = better ? 'best air today' : 'best stretch left';
      els.windowNote.textContent = better
        ? `${w.band[0].toUpperCase()}${w.band.slice(1)} — a step better than the ${w.curBand} air right now.`
        : `Still ${w.band}, but the steadiest stretch left today.`;
    } else if (w.day === 'today') {
      els.windowWhen.textContent = `Today looks ${w.band}`;
      els.windowSub.textContent = 'the whole day';
      els.windowNote.textContent = `Steadily ${w.band} through the daylight hours — no particular hour to aim for.`;
    } else if (w.flat) {
      // A whole day in one band: say what tomorrow is like, do not fake a window.
      els.windowWhen.textContent = `Tomorrow looks ${w.band}`;
      els.windowSub.textContent = 'today is done';
      els.windowNote.textContent = better
        ? `All day, which beats the ${w.curBand} air tonight — no particular hour to aim for.`
        : `All day, much like now. No particular hour to aim for.`;
    } else {
      els.windowWhen.textContent = `Tomorrow, ${when}`;
      els.windowSub.textContent = 'today is done';
      els.windowNote.textContent = `${w.band[0].toUpperCase()}${w.band.slice(1)} — tomorrow's best stretch.`;
    }

    // Whatever the shape, be honest when the best on offer is still unpleasant.
    // The band is already named in every note above, so do not repeat it here.
    if (w.bestRank >= RANK.muggy) {
      els.windowSub.textContent = 'no real relief';
      els.windowNote.textContent = `${els.windowNote.textContent} Nothing better is coming.`;
    }
    els.windowCard.hidden = false;
  }

  async function loadNormals(place) {
    normals = null;
    els.normalCard.hidden = true;
    try {
      const r = await fetch(`/api/normals?lat=${place.lat}&lon=${place.lon}`);
      if (!r.ok) return;                     // no history for this spot — just leave the card off
      const j = await r.json();
      if (!j.q || !j.mix) return;
      normals = j;
      renderNormals();
    } catch { /* the rest of the app is unaffected */ }
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
    els.blurb.textContent = blurbFor(now, cur.temperature_2m);
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

    renderWindow();
    renderNormals();
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
      loadNormals(place);   // slower and optional; never blocks the main view
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
