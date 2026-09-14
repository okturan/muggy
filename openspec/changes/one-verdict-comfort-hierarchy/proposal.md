## Why

The main screen gives two verdicts that can contradict each other. The Comfort tile and headline come from the dew point alone and say "It's muggy out. Keep to the shade and take it slower." Directly below, the humidex card says "Barely registers. Nothing here will slow you down", then "Full sun on top of it. The shade is a different place." The "Is this normal?" card does the same thing: its heading says "stickier than 80% of days" while its body says "only 11% of hours have been stickier". Both numbers are correct, but they measure different things and are presented as one answer.

Every official comfort system we checked has one verdict for the combined load on the body: US NWS heat index, Japan MOE / JSBM WBGT, EU UTCI, Germany DWD Gefühlte Temperatur and Australia BoM apparent temperature. Moisture only qualifies that verdict. "Muggy but mild" is a real, common state on muggy mornings and evenings. The app has to be able to say it in one breath instead of printing two headlines that disagree.

## What Changes

- **One verdict per screen, in a strict order of questions.** (1) How is it out there for a body? (2) What kind of air is it? (3) Do shade, sun or night change that? (4) What is driving it and where is it heading? (5) Is this unusual here? (6) When does it change? A lower slot may add detail to a higher one but never overrule it.
- **New heat-load engine: WBGT as Japan's Ministry of the Environment publishes it.** The levels and alerts come from MOE, so the index follows MOE's definition: psychrometric wet bulb, 150 mm black globe and air temperature. The globe is physically modelled with the Liljegren et al. (2008) energy balance from Argonne National Laboratory, using temperature, humidity, wind, pressure, direct and diffuse radiation, and the sun's position averaged over the sunlit part of each data interval. It is calculated twice, **in the shade** and **in the sun**, for the current minute and every forecast hour.
- **Validated against measurements, not assumptions.** The engine is checked end to end against MOE's 49 stations with measured globe temperature. Its inputs are Open-Meteo historical forecasts, the same data the app sees. At most two physical parameters (surface albedo, minimum 2 m wind) are calibrated on training stations and confirmed on held-out stations. The results are published in the repository and on the About page.
- **Six load levels anchored to published action guidance.** The Japanese Society of Biometeorology daily-life guideline and the Japan MOE WBGT table are the anchors. They replace the humidex brackets and today's ad hoc sub-bracket wording. **BREAKING** for the "What it means" card: humidex is no longer the load engine.
- **Composed headline** from load level × air texture (the dew point band). It includes a shade/sun split headline when the two differ, e.g. "Easy in the shade, work in the sun".
- **Dew point bands stay, but only describe the air.** Band copy is limited to skin, sweat and sleep. Activity advice moves entirely to the load side. **BREAKING** copy change for the muggy, oppressive and miserable blurbs. The "Comfort" stat tile is renamed "Air".
- **"What it means" becomes "Out in it".** It explains what drives the verdict: damp, sun and breeze, each with a signed share that adds up exactly, plus the day's peak and trend. It adds a **"Why this verdict?"** sheet in plain language.
- **Consistency invariants enforced by tests.** Reassurance and severity wording is gated by level. Printed numbers round into the label they sit beside. No card states a level other than the headline's without a time or place qualifier. Unreachable texture × load combinations never render. Boundaries have hysteresis so the verdict doesn't flicker minute to minute.
- **"Is this normal?" uses one comparison basis.** The current reading is compared with past hours at the same time of day (±2 h) around this date. Heading and body state the same number. **BREAKING** for `/api/normals`: new response shape and a new cache version.
- **"When will it get better?" ranks relief by the composed verdict**, load first and texture second, so sunset and cloud cover can count as relief.
- **The About page is rewritten as the explanation.** It covers the two-readings idea, the level ladder with its sources, how shade and sun are modelled, a "try it" explorer and the required Argonne attribution.

## Capabilities

### New Capabilities
- `comfort-verdict`: The single composed verdict. Covers headline and blurb composition from load level × air texture, the shade/sun and night splits, outdoor scope, the question hierarchy that every card follows, cross-card consistency invariants, rounding and hysteresis, and page title and share text.
- `heat-load`: Shade and sun outdoor WBGT for now and every forecast hour. Covers the six load levels and their thresholds, handling of missing inputs, the cool-weather floor below which no heat-load claims are made, and accuracy against reference implementations.
- `air-texture`: The six dew point bands. Covers what band wording may and may not say (no activity advice), the Air stat tile, the sprite and tint, and the hours strip and week view as stickiness timelines.
- `load-explainer`: The "Out in it" card and the "Why this verdict?" sheet. Covers factor attribution for damp, sun and breeze, peak and trend sentences, and level-gated wording.
- `normals-comparison`: "Is this normal?" Covers the same-time-of-day comparison basis, a single stated statistic, the climate bar, and the normals API contract.
- `relief-window`: "When will it get better?" Covers relief ranked by the composed verdict, the night-hour rules, and the fallback to texture relief when the load is already easy.
- `methodology-page`: The About page explanation. Covers the level ladder and its sources, the shade/sun model in plain words, the interactive explorer, the correction of previously published humidex wording, and the Argonne acknowledgment.

### Modified Capabilities
<!-- None: the project has no existing specs (OpenSpec was initialised with this change). -->

## Impact

- **Client (`public/app.js`)**: the rendering logic for headline, blurb, stat tiles, strain card, normals card and relief window is rewritten. Pure logic (WBGT solver, levels, composition, attribution, invariants) moves into testable ES modules under `public/`.
- **Worker (`src/index.js`)**: the forecast request adds `direct_radiation`, `diffuse_radiation` and `surface_pressure` to current, minutely_15 and hourly, and requests wind in m/s. `/api/normals` gains time-of-day quantiles under a new KV key version.
- **Static assets**: new module files must be added to the service worker's precache. `public/about.html` is rewritten. `public/index.html` gains the "Why this verdict?" sheet and renamed card and tile labels.
- **Tests (new)**: `node --test` suites for the solver, levels, composition, invariants and normals basis. A reference comparison against the original Argonne C code compiled locally. Sanity bands against Japan's Ono–Tonouchi regression and UTCI categories. Puppeteer screenshot fixtures for named scenarios, including the 10:30 Tirana case that started this change.
- **Docs and licensing**: README sections on humidex and bands are updated. Argonne's redistribution notice and acknowledgment go in the ported source and on the About page. PyWBGT (CC BY-NC-SA) is not used as a porting source.
- **Performance**: the WBGT solver iterates. It runs about 2 × (1 + 168 hours) solves per render, plus 8 extra solves for attribution, so it must stay well under one frame on a mid-range phone.
