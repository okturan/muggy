## Context

See proposal.md for why this change exists. The current state that constrains the approach:

- **Client** is one classic-script IIFE (`public/app.js`, ~770 lines), loaded with `<script defer>`, no bundler and no tests. Band logic, copy, the humidex card, normals and relief window all live inline.
- **Worker** (`src/index.js`) proxies Open-Meteo with a KV stale-while-revalidate cache (`f:` keys; a cron pre-warmer lists that prefix). It builds normals under `v3:` keys. It renders per-city link previews with a server-side copy of interpolation and band logic (`interpNow`, `bandOf`, `OG_LINE`). Wrangler bundles the worker with esbuild, so it can import ES modules from anywhere in the repo.
- **Service worker** precaches `['/', '/styles.css', '/app.js', …]` under `muggy-v1`, network-first.
- **Data**: we verified on 2026-09-13 that Open-Meteo returns `direct_radiation`, `diffuse_radiation` and `surface_pressure` for `current`, `minutely_15` and `hourly`, and that the archive and historical forecast APIs return them hourly. Radiation values are averages over the preceding interval.
- **Measured WBGT**: Japan MOE's public API (`/api/v1/getSurveyData`, `data_type=1`) returns hourly measured WBGT, wet bulb and 6-inch black-globe temperature for 49 stations. Tokyo, Nagoya, Osaka, Hiroshima, Fukuoka and Niigata go back to 2010. Sapporo, Sendai and Kagoshima start in 2014, Naha in 2018, Kochi in 2024 and the rest in 2025.
- **Tooling available**: Node 26 (built-in `node --test`), Apple clang 21, `pdftotext`, `puppeteer-core` already a dev dependency.
- **Licensing**: the Argonne Liljegren C code (BSD-style, with a notice and acknowledgment requirement) is redistributed under MIT in `mdljts/wbgt`, with the original file intact. PyWBGT is CC BY-NC-SA, so it's not a porting source.

## Goals / Non-Goals

**Goals:**
- Pure, deterministic, unit-testable modules for everything that decides wording. The browser and the worker import the same code.
- An engine whose physics matches its reference implementation, and whose output matches measured WBGT at stations it was not tuned on.
- Copy stored as data, so gating rules can be checked for every string and combination.
- No new runtime dependencies and no build step for the client.

**Non-Goals:**
- Cold stress, wind chill or winter "feels like" verdicts.
- Indoor WBGT, personal profiles (age, acclimatisation, activity choice), notifications or alerts.
- Normals for load. "Is this normal?" stays about stickiness only.
- New sprite art or load-driven sprite variants.
- Locales other than English.
- Machine-learned heat models. Calibration adjusts physical parameters only (D13).

## Decisions

### D1. Load engine: MOE-definition WBGT with Liljegren globe physics
| Option | Sun | Wind | Matches the levels' source | Why not chosen |
|---|---|---|---|---|
| **MOE WBGT: psychrometric Tw + Liljegren 150 mm globe** (chosen) | modelled globe | yes | yes: MOE computes its measured WBGT this way | — |
| ISO/Liljegren WBGT: natural wet bulb + 2-inch globe | modelled | yes | no | runs ~1–3 °C above MOE's index in calm sun; the natural-wet-bulb term alone accounts for most of it (see below) |
| Humidex (current) | no | no | no | cannot tell shade from sun; brackets too coarse |
| NWS heat index | no | no | no | undefined below 26.7 °C; no sun |
| Open-Meteo `apparent_temperature` | ad hoc `Q = max(0, 0.1·(SW−550))` | yes | no | sun ignored below 550 W/m², about +2 °C at 900; formula taken from a calculator site |
| Ono–Tonouchi regression | empirical | yes | approximately (MOE's own estimator) | fitted to Japanese stations with station inputs; kept as a sanity check |
| UTCI | full | yes | no | stress classes don't map to the action levels; used as a reference only |

**Why the definition matters (measured on 2026-09-13).** The Liljegren port matched Argonne to 0.02 °C but ran +1.1 °C above Ono–Tonouchi in Japanese summer daytime, rising to +3.5 °C below 1 m/s of wind. We swapped components one at a time over 3,000 Tokyo summer cases:

| Swap | Mean bias vs Ono–Tonouchi | Share within 2 °C |
|---|---|---|
| none | +1.11 °C | 83 % |
| psychrometric wet bulb | −0.28 °C | 100 % |
| 150 mm globe | +2.23 °C | 55 % |
| surface albedo 0.20 | +0.31 °C | 95 % |
| MOE definition (psychrometric wet bulb and 150 mm globe) | +0.84 °C | 91 % |
| MOE definition with albedo 0.20 | +0.11 °C | 100 % |

MOE's measured WBGT uses a psychrometric wet bulb computed from JMA temperature, humidity and pressure, with a 6-inch globe. Japan's levels and alert thresholds are applied to that number, so Muggy computes the same quantity. The remaining freedom (albedo, calm-wind handling) is settled by measured data (D13), not by the regression.

The North Carolina field study (Weather and Forecasting 39(2), 2024) found Liljegren within about 0.6 °C of ISO meters, slightly cold, using town wind exponents and a 1 m/s wind floor. That confirms the globe physics is sound. The difference from Japan is one of definition, not a modelling error.

### D2. Port from the Argonne original, preserving attribution
`public/lib/wbgt.js` is a line-faithful JavaScript port of `calc_wbgt`, `calc_solar_parameters`, `solarposition`, `Tglobe`, `Twb`, `h_sphere_in_air`, `h_cylinder_in_air`, `esat`, `emis_atm`, `viscosity`, `thermal_cond`, `diffusivity`, `evap`, `est_wind_speed` and `stab_srdt`. The file header carries the Argonne copyright notice, conditions, disclaimer and required acknowledgment, plus a dated modification log. The port adds optional parameters (globe diameter, surface albedo, a supplied cosine of the zenith angle, a supplied direct fraction). Their defaults are the reference values, so the oracle comparison runs on unmodified behaviour.

### D3. Inputs and deliberate departures from the reference
The model gets air temperature, relative humidity, surface pressure (hPa, fallback from elevation), 10 m wind (converted from Open-Meteo's km/h), total and direct irradiance, and the date, time, latitude and longitude.

1. **Direct fraction comes from data.** We use `direct_radiation / shortwave_radiation`, clamped to [0, 0.9] like the original. Liljegren's `exp(3 − 1.34·s − 1.65/s)` estimate is the fallback when direct radiation is missing.
2. **Sun position averaged over the sunlit part of the interval** (Hogan & Hirahara 2016; ECMWF Technical Memo 895). Hourly radiation is an average over its hour, and placing the sun at the midpoint gave errors of up to 2.7 °C in hours containing sunrise or sunset. We compare against minute-resolved physics. The mean cosine over the interval's sunlit minutes, applied to the irradiance scaled to the sunlit fraction, and blended with shade load for the dark fraction, brings the worst case to 0.67 °C for hourly data. For 15-minute data it comes to 0.14 °C. The cosine is computed by numerical quadrature of the port's own solar position, so geometry and physics stay consistent.
3. **No low-sun cap.** An earlier design cut the direct beam below 5.7° of elevation. Measured against minute-resolved physics, the cap added error (1.71 °C steps where the physics has 1.2 °C). The fast rise of WBGT at an equatorial sunrise is real. D3.2 removes the timing artefact the cap was meant to hide.
4. **Stability and wind.** Town exponents (`urban = 1`), consistent with the NC study's finding that rural exponents gave winds that were too fast. The night gradient is not forecast, so it is assumed stable (`dT ≥ 0`), which errs toward caution. Shade and sun share one 2 m wind, estimated from the site's actual irradiance. A minimum 2 m wind is a calibration parameter (D13); the NC study used 1 m/s.
5. **MOE definition.** Globe diameter is 0.15 m. The wet bulb is MOE's psychrometric Iribarne–Godson calculation in `public/lib/psychro.js`, not Liljegren's natural wet bulb.
6. **Surface albedo.** Liljegren's 0.45 reflects bright test-range ground. NDFD uses satellite albedo, around 0.2 for grass. This is the second calibration parameter (D13).
7. **Globe convection per ISO 7726** (added after held-out run 1). Liljegren's sphere correlation is forced convection only, validated with a 2-inch globe. For a 150 mm globe in still air and strong sun it ignores free convection. Held-out run 1 failed on strong-sun bias (+1.47 °C against a ±1.0 °C limit). The residual analysis, done **on training stations only**, found the globe term responsible: Tg was +6.1 °C at ≥700 W/m² and +9.7 °C below 1 m/s, while wet bulb and air temperature contributed ±0.1–0.8 °C of forecast-input error. ISO 7726 (the standard for globe thermometers) uses the larger of natural convection 1.4·(ΔT/D)^¼ and forced convection 6.3·v^0.6/D^0.4. On training stations at albedo 0.15 it cut MAE from 0.896 to 0.770 °C and strong-sun bias from +1.81 to +0.55 °C, with strong-sun Tg bias −0.3 °C. It is part of the index definition, like the 150 mm globe, not a tuned parameter. `public/lib/globe.js` implements it and carries the Argonne notice.

### D4. What "shade" and "sun" mean
Shade means irradiance = 0 while keeping atmospheric and surface longwave radiation: a person under a solid awning or a tree. Sun means the full modelled irradiance. There is no "partial shade" level. Cloud cover already lowers the sun value through the radiation data. Both runs use the same 2 m wind (D3.4).

### D5. Levels and rounding
The thresholds come from the JSBM daily-life table (caution below 25, warning 25–28, severe warning 28–31, danger 31 and up). Caution is split at 21 using MOE's exercise table ("almost safe" below 21). A None floor sits at 18. Levels come from WBGT rounded half-up to an integer. Hysteresis is 0.3 °C around the x.5 rounding boundary, held in a session-only map keyed by place and by shade/sun and reset when the place changes. It sits above the 0.1 °C monotonicity tolerance, so stability-class steps can never flip a level. Dangerous carries the MOE alert marks (33 and above, 35 and above) as sub-labels.

Level display names: None, Easy, Noticeable, Real work, Hard, Dangerous.

### D6. Composition as data, gating as tests
- `public/lib/copy.js` exports one table: `HEADLINES[texture][level]`, `SPLIT` templates, `TEXTURE_SENTENCE[texture][day|night]`, `LOAD_SENTENCE[level][day|night]`, and `QUALIFIER[shade|sun|night]`.
- `public/lib/verdict.js` is a pure function `compose({ texture, shadeLevel, sunLevel, isDay, sunKnown })`. It returns `{ headline, blurb[], tags }`, where `tags` records which gated phrase classes were used.
- `public/lib/lexicon.js` defines phrase classes (reassurance, pace, rest-and-water, avoid-exertion, stop-and-cool, indoor, sun-or-shade, activity-advice) as word and regex lists.
- Tests enumerate every texture × shadeLevel × sunLevel (sun ≥ shade) × day/night × sunKnown combination the engine can reach. Reachability comes from sweeping the engine over a dense input grid. Each composed output is checked against the gating requirements. The same scan runs over "Out in it" and relief-window sentences.

### D7. Factor attribution: exact Shapley over three factors
The reference state is the same air temperature and pressure, dew point `min(T − 0.1, 10 °C)`, irradiance 0, and 10 m wind 2 m/s. The factors are damp, sun and breeze. Exact Shapley values need WBGT at all 2³ = 8 on/off combinations. The contributions sum exactly to actual minus reference. Word buckets on |c|: below 0.5 nothing, below 1.5 a little, below 3 some, 3 and above a lot. Negative values of 0.5 and beyond read as "takes some off".

### D8. Module layout and loading
```
public/lib/
  wbgt.js        Liljegren port (+ Argonne notice, optional parameters)
  globe.js       150 mm globe: Liljegren energy balance with ISO 7726 convection
  psychro.js     MOE psychrometric wet bulb (Iribarne & Godson)
  sun.js         sunlit-part averaged solar zenith cosine
  load.js        shade/sun MOE-definition WBGT for a reading or series; missing-input rules; memoised
  calibration.js calibrated parameters with their provenance (written from validation results)
  levels.js      thresholds, rounding, hysteresis, alert marks
  texture.js     bands, texture ranks
  interp.js      minute interpolation shared with the worker
  copy.js        all verdict/explainer/relief strings as data
  lexicon.js     phrase classes for gating
  verdict.js     compose()
  explain.js     Shapley attribution, peak/trend sentence selection
  relief.js      composite ranking, window search
  normals.js     time-of-day percentile, daypart naming
```
`public/app.js` becomes `<script type="module">` and keeps DOM, fetching and state only. `src/index.js` imports the pure modules for link previews and deletes its duplicated logic. The service worker's `CORE` adds every `public/lib/*.js` and the cache name becomes `muggy-v2`.

### D9. Worker forecast and normals changes
- **Forecast**: add `direct_radiation`, `diffuse_radiation` and `surface_pressure` to `current`, `minutely_15` and `hourly`, keeping km/h wind. The KV prefix goes from `f:` to `f2:`, and the cron pre-warmer changes with it.
- **Normals v4**: values grouped by local hour of day, each hour H pooling hours H−2…H+2 (wrapping at midnight) over ±7 days × 10 years, about 750 samples. Each hour stores a 101-point ladder, band shares and a sample count, cached under `v4:`. The `days` array is removed.

### D10. Testing strategy
- **Unit** (`node --test test/`): levels, rounding and hysteresis, bands, compose, lexicon gating, Shapley sums, relief ranking, normals percentile and dayparts, psychrometric wet bulb against Stull (2011).
- **Reference oracle**: `tools/wbgt-oracle/` links the unmodified Argonne source. `verify.sh` proves the driver reproduces the original demo program. `make-fixtures.mjs` writes `test/fixtures/wbgt-grid.json` (17,621 cases), and the port is required to match within 0.1 °C at reference parameters.
- **Minute-resolved physics**: a synthetic clear-sky grid (6 latitudes × 4 dates × 3 air types) compares interval-averaged evaluation with the mean of minute-by-minute evaluation (≤ 0.7 °C hourly, ≤ 0.2 °C for 15 minutes).
- **Independent sanity**: Ono–Tonouchi (≥ 95 % within 2 °C) and monotonicity (≤ 0.1 °C decrease).
- **Measured validation** (D13): end-to-end metrics on held-out MOE stations, run by `tools/wbgt-validation`. Its published `results.json` is read by a unit test that asserts the heat-load accuracy thresholds, so a recalibration that misses them fails CI.
- **Screens**: Puppeteer against `wrangler dev` with intercepted API fixtures, including `tirana-2026-09-13-1030`, `muggy-mild-dawn`, `split-noon`, `dry-heat-danger`, `sunset-relief`, `missing-radiation` and `night-oppressive`. The clock is frozen.
- **Performance**: Puppeteer with 4× CPU throttling times the load calculation. Budget 50 ms.

### D11. About page explorer
It uses the same modules. Sun "some" and "full" map to clear-sky irradiance at a fixed solar elevation (35° and 65°), with direct fraction 0.4 and 0.85. Wind "still", "breeze" and "windy" map to 0.5, 3 and 8 m/s at 10 m. Air texture sets the dew point at the band midpoint, capped below air temperature. Results announce through an `aria-live="polite"` region.

### D12. Psychrometric wet bulb
`psychro.js` implements MOE's method verbatim. The dew point comes from air temperature and relative humidity by the Magnus form (A = 7.5, B = 237.3). The first estimate is `Tw = (Ta·f·p + Td·s)/(f·p + s)`, with `s = (es − ed)/(Ta − Td)`, `e = exp(C0 − C1·T − C2/T)`, C0 = 26.66082, C1 = 0.0091379024, C2 = 6106.396 and f = 0.0006355 K⁻¹. Newton corrections `Tw ← Tw − de/der` follow until convergence. MOE stops at the third estimate, which is within 0.1 °C; we iterate to 0.001 °C.

### D13. Validation and calibration protocol
1. **Data.** `tools/wbgt-validation/fetch.mjs` downloads MOE measured hours (`data_type=1`, with quality flag) for the 49 stations, over May–September from 2022, clipped to each station's measured period and to yesterday. For each station and season it also fetches Open-Meteo historical forecasts (best-match model, the app's own variables, `timezone=Asia/Tokyo`). Raw files go under `tools/wbgt-validation/data/` (git-ignored, reproducible). Requests are sequential and throttled well inside both services' limits.
2. **Alignment.** MOE hours are JST observation times. Inputs are aligned so radiation averages bracket the observation (both timing variants are evaluated and the better one on training stations is fixed). Hours are excluded when MOE marks the value as estimated (`wbgt_class = 0`) or of low quality, or when any input is missing.
3. **Split.** Stations are assigned to train or held-out by a deterministic hash of the station number. Stratified by record length so both sets include long-record stations, about 60/40. Every season of a held-out station is held out.
   **Superseded after run 2 by leave-one-station-out cross-validation** over all 47 stations (`crossval.mjs`). One fixed split had been used for two evaluations, and a single split is fragile. Each configuration is evaluated once per station; for each station the rule chooses from the other 46, and the pooled out-of-fold errors are the published accuracy. The shipped parameters come from the same rule on all stations. The fixed split is still reported for continuity.
4. **Candidates.** Surface albedo {0.10, 0.15, 0.20, 0.25, 0.30, 0.45} (0.10 added with run 2, for dark urban surfaces) × minimum 2 m wind {0.13 (reference), 0.5, 1.0} m/s × radiation timing variant. Baselines are also reported: ISO Liljegren, and Ono–Tonouchi with the same inputs.
5. **Decision rule.** Originally: MAE within 0.1 °C of the best, then the lowest severe under-warning rate. **Revised after run 2**, because the training data alone showed the defect: the rule ignored the spec's band limits and let differences of 0.06 % vs 0.15 % in severe misses (both far below the 2 % limit) pick albedo 0.45, which already broke the strong-sun limit on the training stations. The rule is now: eligible configurations meet every accuracy threshold on the stations they are chosen from (otherwise those with the fewest misses); lowest MAE; within 0.02 °C, closest to the reference values, then the app's own "preceding" timing.
6. **Report.** Held-out metrics (MAE, bias overall and by wind band, irradiance band, hour of day, level; level agreement; severe under-warning) go to `tools/wbgt-validation/results.json` and `RESULTS.md`, and are summarised on the About page. `public/lib/calibration.js` is generated from `results.json` with the chosen values, the data window and the commit of the run.
7a. **Radiation timing.** MOE observations are instants at the top of the hour; the app's current reading is a 15-minute step and its hourly series a preceding-hour mean. The cross-validation aligns the forecast's hourly radiation to the observation instant with a centred two-hour window, the closer proxy for the current reading. The same parameters are also scored under the preceding-hour alignment and published beside the main figure as a sensitivity check (`appHourlyAlignment` in `results.json`).
7. **If thresholds are missed**, the run fails loudly. The next steps would be: a residual analysis by band; checking input bias (e.g. forecast wind or radiation vs JMA station values) against model bias; and only then widening the physical parameter set, recorded as a design change. No statistical post-correction without a new decision here.
8. **Run history.** Every held-out evaluation is appended to `tools/wbgt-validation/history.json` and listed in `RESULTS.md`, passing or not. Runs after the first reuse the same held-out stations, and that is stated next to the results. Any change between runs must be justified by training-station evidence alone.
9. **Runs so far.** Run 1 (fixed split, Liljegren sphere convection, albedo 0.25) failed on strong-sun bias (+1.47 °C). Run 2 (fixed split, ISO 7726 convection, old rule chose albedo 0.45) failed on strong-sun bias (+1.11 °C), with MAE 0.85 °C, bias 0.00 °C and 99.8 % within one level. Run 3 (leave-one-station-out over 47 stations, ISO 7726 globe, revised rule) passed: out-of-fold MAE 0.79 °C, bias −0.16 °C, strong-sun bias +0.56 °C, 99.8 % within one level, severe under-warning 0.13 %. Every fold chose albedo 0.20 and minimum wind 0.13 m/s, and those are the shipped parameters. MOE's own regression reaches MAE 0.77 °C on the same forecast inputs. The physical engine is on par for accuracy, and it is chosen for what a regression cannot give: the shade/sun split and an attributable breakdown.

## Risks / Trade-offs

- [Forecast inputs, not station instruments, drive the app] → Validation deliberately uses forecast inputs, so the published error is the error users actually get.
- [Validation is Japan-only] → MOE is the only open network with measured globe temperature at scale, and the levels are MOE's own. The NC ISO-meter results (D1) are an independent check that the globe physics holds elsewhere. About states the geographic scope of the evidence.
- [Overfitting two parameters] → Held-out stations, a decision rule fixed beforehand, a small grid, and a physical meaning for each parameter.
- [MOE measured WBGT is itself a computed index] → Muggy aims to reproduce the published index people act on, and the About page says exactly that.
- [Sunrise/sunset] → Sunlit-part averaging (D3.2), verified against minute-resolved physics.
- [WBGT is unfamiliar where humidex and heat index are known] → The verdict never needs the number.
- [Composition copy grows and drifts] → Copy as data with exhaustive gating tests (D6).
- [Solver cost on low-end phones] → Memoisation; hourly series computed once per forecast load; performance test.
- [Stale KV forecasts lacking new fields] → Prefix bump (D9) plus missing-field handling.
- [Worker bundle pulling in DOM code] → Purity test on every `public/lib` module.
- [Licence compliance] → Notice and modification log in `wbgt.js` and the oracle. Acknowledgment on About and in README. MOE and Open-Meteo data are credited in results and on About.

## Migration Plan

1. Engine, validation and calibration (no UI change).
2. Remaining modules and tests (levels, copy, compose, explainer, relief, normals).
3. Worker: forecast fields and `f2:` prefix, normals `v4:`, shared link-preview logic.
4. Client switch-over, service worker `muggy-v2`.
5. About page (including validation summary) and README.
6. Deploy with `wrangler deploy`, then run screen fixtures against production.

Rollback: `git revert` and redeploy. KV keys are versioned, and the service worker is network-first.

## Open Questions

- Exact wording of each cell in the composition table and the explainer sentences. Written during implementation within the lexicon and gating rules.
- Whether "Real work" is the best display name for level 3. It can be renamed in `copy.js` without affecting specs or tasks.
