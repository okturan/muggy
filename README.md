# Muggy

**How sticky is it out there?** A small mobile-first weather app that answers the question ordinary
weather apps bury: not how hot it is, but how the outside air actually treats you. It puts a pixel cloud
in a jacket on the front of it.

🌦️ **Live: [muggy.fyi](https://muggy.fyi)**. Share a city as `muggy.fyi/tirana`.

<img src="design/cloud-muggy.png" width="120" alt="the muggy cloud">

## One verdict, two readings

Muggy reads the air two ways and turns them into **one** verdict:

- **What kind of air it is**: the dew point, sorted into six bands. It describes skin and sweat, never
  what to do.
- **How heavily it sits on a body**: WBGT (wet-bulb globe temperature), in the shade and in the sun.
  This is the part that decides pace, breaks and when to stop.

The heat load leads the headline and the air qualifies it. So a humid morning can honestly be
**"Muggy but mild"**, and a noon can be **"Easy in the shade, noticeable in the sun"**. An earlier
version printed the two readings as rival verdicts: *"It's muggy out. Take it slower than usual"* sat
directly above *"Barely registers. Nothing here will slow you down."* That can't happen any more. Copy
lives as data, and a test sweeps every combination the engine can produce (186 of them) against gating
rules. Reassurance appears only when both shade and sun are easy, severity only when the level has earned
it, sun wording only in known daylight, and no activity advice in the air's description.

### The six air bands

| Band | Dew point | What the air does |
|---|---|---|
| dry | below 12.8 °C | Sweat vanishes the moment it forms. |
| comfortable | 12.8 – 15.6 °C | Sweat dries as fast as it comes. |
| humid | 15.6 – 18.3 °C | You notice it on your skin, not much more. |
| muggy | 18.3 – 21.1 °C | Shirts stick; sweat is slow to dry. |
| oppressive | 21.1 – 23.9 °C | Sweat barely dries, so it stops cooling you. |
| miserable | 23.9 °C and up | Saturated: sweat pours and does almost nothing. |

The thresholds are the ones [WeatherSpark](https://weatherspark.com) popularised (55/60/65/70/75 °F).
The dew point number never reaches the screen; the band does. The band also sets the character, the
screen tint and the link-preview banner.

### The six load levels

| Level | WBGT (rounded) | Anchor |
|---|---|---|
| None | below 18 | no heat-load claims |
| Easy | 18 – 20 | MOE "almost safe" |
| Noticeable | 21 – 24 | MOE "caution" |
| Real work | 25 – 27 | JSBM/MOE "warning": regular rest during labour and sport |
| Hard | 28 – 30 | JSBM/MOE "severe warning": avoid direct sun, avoid heavy exercise |
| Dangerous | 31 and up | JSBM/MOE "danger"; 33+ and 35+ carry Japan's heat-stroke alert marks |

Level changes need a clear crossing (0.3 °C past the rounding line), so a reading on a boundary doesn't
flip the verdict every minute.

## The heat-load engine

WBGT follows the definition behind those levels: Japan's Ministry of the Environment computes its
published measured WBGT as

```
WBGT = 0.7 · Tw + 0.2 · Tg + 0.1 · Ta
```

with **Tw** a psychrometric wet bulb (MOE's Iribarne–Godson method, `public/lib/psychro.js`) and **Tg** a
150 mm black globe. Muggy models the globe from the forecast:

- **Energy balance**: [Liljegren et al. (2008)](https://doi.org/10.1080/15459620802310770), ported line by
  line from Argonne National Laboratory's C source (`public/lib/wbgt.js`). The port matches the original,
  compiled locally as an oracle, to 0.02 °C over 17,621 cases (`tools/wbgt-oracle/`).
- **Globe convection**: ISO 7726, the standard for 150 mm globes (`public/lib/globe.js`). Liljegren's own
  forced-only correlation, validated for 2-inch globes, left the globe 6 °C too warm in strong sun.
- **The sun**: the forecast's direct/diffuse split, averaged over the **sunlit part** of each data interval
  (Hogan & Hirahara 2016; ECMWF Tech Memo 895). Placing the sun at an interval's midpoint was off by up to
  2.7 °C in sunrise and sunset hours. The engine is within 0.39 °C of minute-by-minute physics for hourly
  data and 0.17 °C for 15-minute data.
- **Wind**: one 2 m wind for shade and sun, from town stability classes; a stable night is assumed.

### Validated against measured WBGT

`tools/wbgt-validation/` compares the engine with **Japan MOE's measured stations** (6-inch globes), using
Open-Meteo historical forecasts as inputs, exactly what the app sees. Two physical parameters are
calibrated: surface albedo and a minimum 2 m wind. They are chosen by a fixed rule in
**leave-one-station-out** cross-validation: every station is predicted with parameters chosen without it.

Over 47 stations and 434,405 measured hours (May–September, 2022–2026), out of fold:

| | MAE | bias | within one level | severe under-warning |
|---|---|---|---|---|
| **Muggy** | **0.79 °C** | −0.16 °C | 99.8 % | 0.13 % |
| Ono–Tonouchi (MOE's own estimator), same inputs | 0.77 °C | +0.02 °C | 99.8 % | 0.1 % |
| Liljegren ISO WBGT, same inputs | 1.18 °C | +0.53 °C | 98.1 % | 0.0 % |

Muggy matches MOE's regression on accuracy and adds what a regression can't give: a shade/sun split and a
breakdown into damp, sun and breeze that adds up exactly (Shapley attribution). Every run is kept,
including the two that failed before the protocol and globe convection were fixed. See
[`tools/wbgt-validation/RESULTS.md`](tools/wbgt-validation/RESULTS.md). Shipped parameters: albedo 0.20,
minimum wind 0.13 m/s.

## The screen

- **Headline and blurb**: the verdict, at most three sentences: air, body, then shade/sun or night.
- **Out in it**: damp, sun and breeze as signed bars with words; where the day is heading ("It gets to
  real work by 12:00"); the WBGT numbers in small print. **Why this verdict?** opens a plain-language sheet.
- **Is this normal?**: the current dew point against ten years of past hours at the **same time of day**
  (±2 h) within a week of today's date. One statistic: *"stickier than 78% of mornings"*.
- **When will it get better?**: ranked like the verdict, load first and air second, so sunset counts as
  relief: *"Easy from 21:00, once the sun is down."*
- **Next hours / This week**: stickiness timelines by band.

## Where the data comes from

[Open-Meteo](https://open-meteo.com/) forecasts, archive and historical forecasts, CC-BY 4.0, no API key
for non-commercial use. Validation data: Japan Ministry of the Environment, Heat Illness Prevention
Information (wbgt.env.go.jp).

WeatherSpark is **not** used as a data source; only its published band thresholds are.

> Note: Open-Meteo's free tier is non-commercial. Adding ads or subscriptions would mean getting an API
> key from them, a one-line change in the Worker.

### Sharing

Every named city is a URL (`muggy.fyi/tirana`, `muggy.fyi/kuala-lumpur`), and the share button uses the
native share sheet. Link unfurlers run no JavaScript, so the Worker resolves the slug server-side and
writes the live verdict into the Open Graph tags, using **the same modules as the page**, so the preview
and the page can't disagree. The banner matches the air band (`tools/make-og.py`).

## How it's built

A single Cloudflare Worker on `muggy.fyi` serving static assets, with Open-Meteo behind a two-layer cache:

```
edge cache (per colo, minutes) → KV (global, stale-while-revalidate) → upstream
```

A forecast younger than 5 minutes serves as fresh; up to 30 minutes old it serves instantly and refreshes
in the background; if the upstream is down, stale data serves for a day. The client interpolates the
15-minutely series to the actual minute and re-renders every minute. The heat-load series is memoised, so
only the current minute recomputes.

```
src/index.js               Worker: /api/forecast, /api/geocode, /api/normals, OG previews
public/app.js              The screen (ES module; no framework, no build step)
public/lib/                Pure modules shared by the page and the Worker
  wbgt.js globe.js psychro.js sun.js load.js calibration.js   heat-load engine
  texture.js levels.js interp.js                               readings
  copy.js lexicon.js verdict.js explain.js relief.js normals.js explorer.js   words
tools/wbgt-oracle/         Argonne reference build and fixture generator
tools/wbgt-validation/     Measured-WBGT download, cross-validation, published results
tools/reachability.mjs     Every verdict combination the engine can produce
tools/e2e-fixtures.mjs     Named browser-test scenarios, confirmed against the engine
test/                      node --test suites; test/e2e/ Puppeteer checks
```

**API**

| Route | Cache | Notes |
|---|---|---|
| `GET /api/forecast?lat=&lon=` | KV SWR under `f2:` (5 min fresh / 30 min stale / 24 h emergency) | includes direct/diffuse radiation and surface pressure |
| `GET /api/geocode?q=` | KV 30 d | City search |
| `GET /api/normals?lat=&lon=` | KV 200 d under `v4:` | For each local hour: a 101-point dew-point ladder over ±2 h and ±7 days of ten years, band shares, sample count |

**The character art** is an AI-generated spritesheet laid out as a 6-row grid, one row per band, shot
on magenta. `tools/slice-sprites.py` keys it on **distance from the measured plate colour**, not on a
hue rule. A hue rule erases the saturated pink `oppressive` body along with the background. The foreground
is then eroded 2px against JPEG halo, cells come from gutters in the alpha projection, and every frame is
bottom-aligned on a common ground line. Strips animate with `steps(n)` to `n/(n-1)*100%`.

## Running it

```bash
npm install
npm run dev        # wrangler dev → http://localhost:8787
npm test           # unit, engine, validation and copy-gating suites
npm run test:e2e   # browser checks (needs: npx wrangler dev --local-protocol https)
MUGGY_BASE=https://muggy.fyi node test/e2e/live.e2e.mjs   # real-data smoke against a deployment
npm run deploy     # wrangler deploy
npm run sprites    # re-slice the spritesheets (needs Python + Pillow)
```

Rebuild the engine evidence: `sh tools/wbgt-oracle/make-fixtures.sh` (needs a C compiler), then
`node tools/wbgt-validation/fetch.mjs && node tools/wbgt-validation/dataset.mjs &&
node tools/wbgt-validation/crossval.mjs && node tools/wbgt-validation/validate.mjs`.

`wrangler.jsonc` carries a Cloudflare `account_id`. That's an identifier, not a credential; swap it for
your own if you fork this.

## Credits

Weather data by [Open-Meteo](https://open-meteo.com/) (CC-BY 4.0). Measured WBGT for validation from
Japan's Ministry of the Environment. Air bands after [WeatherSpark](https://weatherspark.com). Level
guidance after the Japanese Society of Biometeorology and Japan's Ministry of the Environment. WBGT model
by James C. Liljegren, Argonne National Laboratory.

This product includes software produced by UChicago Argonne, LLC under Contract No. DE-AC02-06CH11357 with
the Department of Energy.

Type is [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) and
[Nunito](https://fonts.google.com/specimen/Nunito).
