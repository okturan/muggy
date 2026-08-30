/* Muggy — dew point → comfort band, with a cloud who feels it. */
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
   * Headline and blurbs per band: [headline, day blurb, night blurb].
   *
   * Blurbs describe how well sweat evaporates — what the dew point measures —
   * never how warm it is. And the advice must know whether the sun is up:
   * "keep to the shade" at 23:00 is meaningless, and the sticky bands are a
   * different problem at night, when the question becomes sleep.
   */
  const COPY = {
    dry:         ['Crisp and dry',
                  'Sweat evaporates the moment it forms.',
                  'Sweat evaporates the moment it forms.'],
    comfortable: ['Perfect air',
                  'Nothing to plan around — this is about as good as air gets.',
                  'Nothing to plan around — as good as a night gets.'],
    humid:       ['A little sticky',
                  "You'll notice it, but it stays out of your way. Something light and breathable is plenty.",
                  "You'll notice it, but it stays out of your way. Sleep should be fine."],
    muggy:       ["It's muggy out",
                  'Shirts start sticking. Keep to the shade and take it slower than usual.',
                  'Shirts stick even without the sun. A sticky night — moving air helps sleep.'],
    oppressive:  ['Oppressive',
                  'Sweat stops evaporating, so you stop cooling down. Slow everything down and keep water on you.',
                  "Sweat won't dry even with the sun long gone. A fan pointed at the bed is the move."],
    miserable:   ['Miserable',
                  'The air cannot hold any more water, so sweating barely works. Stay in and find air conditioning.',
                  'The air cannot hold any more water, even at night. This is what AC was invented for.'],
  };

  /** Pick the blurb for the moment: dry asks the temperature, the rest ask the sun. */
  function blurbFor(band, cur) {
    const night = cur.is_day === 0;
    if (band === 'dry' && cur.temperature_2m != null) {
      const t = cur.temperature_2m;
      if (t < 10) return `${COPY.dry[1]} Cold and dry — the kind that chaps lips. Drink more than you feel like.`;
      if (t > 28) return `${COPY.dry[1]} Dry heat: you will not feel yourself sweating, which is exactly why to keep drinking.`;
      return `${COPY.dry[1]} Easy air — your skin will notice before you do.`;
    }
    return COPY[band][night ? 2 : 1];
  }
  const DEFAULT_PLACE = { name: 'Tirana', lat: 41.33, lon: 19.82 };

  const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
    strainCard: $('strainCard'), strainSub: $('strainSub'), strainValue: $('strainValue'), strainNote: $('strainNote'),
  };

  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem('muggy:prefs') || '{}'); } catch { return {}; }
  })();
  const savePrefs = () => { try { localStorage.setItem('muggy:prefs', JSON.stringify(prefs)); } catch {} };

  const qs = new URLSearchParams(location.search);
  let unit = (qs.get('unit') || prefs.unit) === 'f' ? 'f' : 'c';
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
    document.querySelectorAll('.units button').forEach((b) => b.classList.toggle('is-on', b.dataset.unit === unit));
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

  // ---------- how it lands ----------
  /**
   * Humidex — Environment Canada's discomfort index, T + 0.5555*(e - 10) with e
   * the vapour pressure from the dew point.
   *
   * This is the second axis the app was missing. A comfort band is deliberately
   * moisture-only, so 20° dew point reads "muggy" at four in the afternoon and
   * at midnight alike — while the body plainly disagrees, because the air is
   * ten degrees cooler and the sun has gone. Humidex is built from the same dew
   * point the rest of the app runs on, and adds exactly the missing term.
   *
   * Chosen over WBGT and UTCI deliberately: both model solar load properly, but
   * WBGT needs a globe temperature (and a *natural* wet bulb, not the
   * psychrometric one the API returns) and UTCI needs mean radiant temperature
   * and a ~200-term polynomial. Approximating either would mean showing a
   * precise-looking number that is quietly guessed. The sun is handled
   * separately and honestly, from is_day and the actual radiation.
   */
  function humidex(tempC, dewC) {
    if (tempC == null || dewC == null) return null;
    const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewC)));
    return tempC + 0.5555 * (e - 10);
  }
  /**
   * Environment Canada's bands, said in plain words.
   *
   * "Humidex 36" is exactly as meaningless as "dew point 21" — which the app
   * refuses to print for that very reason — so the verdict leads and the number
   * follows quietly, for anyone who already knows the scale. The official band
   * names (little/some/great discomfort, dangerous) are about exertion, so the
   * wording is too.
   */
  const HUMIDEX_LEVELS = [
    { max: 30, head: 'Barely registers',
      body: 'The heat and the stickiness together add up to very little — nothing here will slow you down.' },
    { max: 40, head: 'Fine unless you push',
      body: 'Enough heat and stickiness together to notice on a hill or a fast walk, not enough to stop you.' },
    { max: 46, head: 'Hard on the body',
      body: 'Heat and stickiness combined are at the level where the official advice is to avoid real exertion.' },
    { max: Infinity, head: 'Dangerous to exert',
      body: 'Heat and stickiness combined are in heat-stroke territory. Do not push it.' },
  ];

  function renderStrain() {
    const { current: cur, hourly: h } = data;
    const hx = humidex(cur.temperature_2m, cur.dew_point_2m);
    // Below ~25 the index is just the air temperature wearing a hat.
    if (hx == null || hx < 25) { els.strainCard.hidden = true; return; }

    const level = HUMIDEX_LEVELS.find((l) => hx < l.max);
    els.strainValue.textContent = level.head;
    els.strainSub.innerHTML = `<a href="/about#humidex">humidex ${Math.round(hx)} · what's this?</a>`;

    // Today's peak, so "now" has something to be measured against.
    const today = cur.time.slice(0, 10);
    let peak = null;
    h.time.forEach((t, i) => {
      if (t.slice(0, 10) !== today) return;
      const v = humidex(h.temperature_2m[i], h.dew_point_2m[i]);
      if (v != null && (!peak || v > peak.v)) peak = { v, t };
    });

    const parts = [level.body];
    if (peak && peak.v - hx >= 3) {
      parts.push(`Today peaked at ${Math.round(peak.v)} around ${hourLabel(peak.t)}:00, so this is ${Math.round(peak.v - hx)} lower.`);
    } else if (peak && hx - peak.v >= -1) {
      parts.push('This is about as heavy as today gets.');
    }

    // The sun, from the actual radiation rather than the clock.
    const sun = cur.shortwave_radiation;
    if (cur.is_day === 0) {
      parts.push('With the sun down, the same moisture is far easier work.');
    } else if (sun != null && sun > 450) {
      parts.push('Full sun on top of it — the shade is a different place.');
    } else if (sun != null && sun > 120) {
      parts.push('Some sun on top of it.');
    }
    els.strainNote.textContent = parts.join(' ');
    els.strainCard.hidden = false;
  }

  // ---------- when to go out ----------
  const NIGHT_START = 6;   // never headline 03:00 as the moment to go out

  /**
   * When the air next eases off.
   *
   * The question people actually have is "when does this let up", so the search
   * runs forward from now and reports the first stretch that is a band better
   * than the air right now.
   *
   * Evenings and nights count. On a muggy day the relief almost always arrives
   * after dark, and an earlier version that only searched 07:00-21:00 told
   * people at 20:30 that nothing better was coming — while 23:00 was humid and
   * midnight was comfortable, two bands down and plainly visible in the hours
   * strip right below it. Night hours can no longer *open* a window (nobody
   * plans around 03:00) but they can extend one, which is what lets the card
   * say the air keeps easing after midnight.
   */
  function bestWindow() {
    const { current: cur, hourly: h } = data;
    let start = h.time.findIndex((t) => t.slice(0, 13) === cur.time.slice(0, 13));
    if (start < 0) start = 0;

    // From the NEXT hour: the current hour's bucket is the air you already have,
    // and offering it as relief reads as "go out at 20:00" when it is 20:30.
    const pool = [];
    for (let i = start + 1; i < Math.min(start + 25, h.time.length); i++) {
      const dp = h.dew_point_2m[i];
      if (dp == null) continue;
      pool.push({ i, t: h.time[i], hr: +h.time[i].slice(11, 13), rank: RANK[levelOf(dp)] });
    }
    if (!pool.length) return null;

    const curBand = levelOf(cur.dew_point_2m);
    const curRank = RANK[curBand];
    const at = pool.findIndex((c) => c.rank < curRank && c.hr >= NIGHT_START);
    if (at < 0) return { kind: 'none', curBand, curRank };

    const target = pool[at].rank;
    let end = at;
    while (end + 1 < pool.length && pool[end + 1].rank <= target
           && pool[end + 1].i === pool[end].i + 1) end++;

    // Where the run actually bottoms out — "muggy at 22:00" undersells a night
    // that reaches comfortable by midnight.
    let bestAt = at;
    for (let k = at; k <= end; k++) if (pool[k].rank < pool[bestAt].rank) bestAt = k;

    return {
      kind: 'relief',
      band: BANDS[target].id,
      bestRank: target,
      start: pool[at].t,
      end: pool[end].t,
      len: end - at + 1,
      bestBand: BANDS[pool[bestAt].rank].id,
      bestTime: pool[bestAt].t,
      deepens: pool[bestAt].rank < target,
      tomorrow: pool[at].t.slice(0, 10) !== cur.time.slice(0, 10),
      curBand,
      curRank,
    };
  }

  function renderWindow() {
    const w = bestWindow();
    if (!w) { els.windowCard.hidden = true; return; }
    const panel = els.windowCard.querySelector('.panel');
    const cap = (x) => x[0].toUpperCase() + x.slice(1);

    if (w.kind === 'none') {
      if (panel) panel.style.background = `var(--c-${w.curBand})`;
      els.windowWhen.textContent = 'Right now';
      els.windowSub.textContent = w.curRank >= RANK.muggy ? 'no real relief' : 'as good as it gets';
      els.windowNote.textContent = w.curRank >= RANK.muggy
        ? `Nothing in the next 24 hours is any better than the ${w.curBand} air right now.`
        : `Nothing in the next 24 hours beats the ${w.curBand} air you already have.`;
      els.windowCard.hidden = false;
      return;
    }

    // Tint with the band you are being sent out into, not the current one.
    if (panel) panel.style.background = `var(--c-${w.deepens ? w.bestBand : w.band})`;
    const from = `${hourLabel(w.start)}:00`;
    const to = `${String((+hourLabel(w.end) + 1) % 24).padStart(2, '0')}:00`;
    // A run of half a day is not a window to aim at, so give it an opening time.
    const when = w.len > 8 || w.len === 1 ? `From ${from}` : `${from} – ${to}`;
    els.windowWhen.textContent = w.tomorrow ? `Tomorrow, ${when}` : when;
    els.windowSub.textContent = w.bestRank >= RANK.muggy && !w.deepens ? 'a little relief' : 'first relief';
    els.windowNote.textContent = w.deepens
      ? `${cap(w.band)} from ${from}, easing to ${w.bestBand} by ${hourLabel(w.bestTime)}:00.`
      : `${cap(w.band)} — a step better than the ${w.curBand} air right now.`;
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
    els.blurb.textContent = blurbFor(now, cur);
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

    renderStrain();
    renderWindow();
    renderNormals();
  }

  // ---------- data ----------
  function syncUrl(place, push) {
    // Geolocation stays at "/" — coordinates do not belong in a shareable URL.
    const path = place.geo ? '/' : `/${slugify(place.name)}`;
    try {
      if (push) history.pushState({}, '', path);
      else history.replaceState({}, '', path);
    } catch { /* sandboxed contexts */ }
  }

  async function load(place, { push } = {}) {
    app.dataset.state = 'loading';
    els.placeName.textContent = place.name;
    syncUrl(place, push);
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
      load({ name: p.name, lat: p.lat, lon: p.lon }, { push: true });
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

  // ---------- boot ----------
  async function loadFromSlug(slug) {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(slug.replace(/-/g, ' '))}`);
      const j = await r.json();
      const p = (j.results || [])[0];
      if (!p) return false;
      load({ name: p.name, lat: p.lat, lon: p.lon });
      return true;
    } catch { return false; }
  }

  window.addEventListener('popstate', () => {
    const slug = location.pathname.replace(/^\/+|\/+$/g, '');
    if (slug) loadFromSlug(slug);
    else if (prefs.place) load(prefs.place);
  });

  $('shareBtn').addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    const title = document.title;
    const text = data ? `${els.title.textContent} in ${els.placeName.textContent} — ${els.blurb.textContent}` : title;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch { /* dismissed */ }
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    }
  });

  applyPrefUI();
  (async () => {
    const slug = location.pathname.replace(/^\/+|\/+$/g, '');
    if (/^[a-z0-9-]{2,60}$/i.test(slug)) {
      if (await loadFromSlug(slug)) return;
      toast('Could not find that place');
    }
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
