## Purpose

Calculates how heavily the outside air weighs on a person, in the shade and in the sun, for now and every forecast hour. It reports this on six levels tied to published heat-illness guidance, and its accuracy is shown against measured WBGT.

## ADDED Requirements

### Requirement: WBGT follows the definition behind the levels
The system SHALL compute WBGT the way the Japan Ministry of the Environment computes its published measured values, because that index is where the load levels and alert marks come from:

WBGT = 0.7 × Tw + 0.2 × Tg + 0.1 × Ta

- **Tw** is the psychrometric wet-bulb temperature from air temperature, relative humidity and pressure, using MOE's method (Iribarne & Godson).
- **Tg** is the temperature of a 150 mm black globe, modelled with the Liljegren et al. (2008) energy balance and the ISO 7726 convective heat transfer for globe thermometers.
- **Ta** is the air temperature.

Two values SHALL be produced:
- **Shade WBGT**: calculated with no solar irradiance, for a person under full cover.
- **Sun WBGT**: calculated with the modelled solar irradiance, for a person in direct sun.

When the sun is below the horizon for the whole data interval, sun WBGT SHALL equal shade WBGT.

#### Scenario: Definition
- **WHEN** Ta = 30 °C, Tw = 24 °C and Tg = 45 °C are produced for an input
- **THEN** its WBGT is 29.8 °C

#### Scenario: Night equals shade
- **WHEN** the sun is below the horizon for the whole interval
- **THEN** sun WBGT equals shade WBGT

#### Scenario: Sun raises the load
- **WHEN** the sun is high, the sky is clear and irradiance is above 600 W/m²
- **THEN** sun WBGT is higher than shade WBGT

### Requirement: Now and every forecast hour
The system SHALL calculate shade and sun WBGT for the interpolated current minute and for every hour of the forecast. The current value SHALL use the same interpolated inputs as the rest of the screen.

#### Scenario: Hourly series is complete
- **WHEN** a forecast with 168 hourly steps has loaded
- **THEN** shade and sun WBGT exist for every hour that has air temperature and humidity

### Requirement: Sun geometry matches averaged radiation
Radiation that the data source reports as an average over an interval SHALL be paired with the cosine of the solar zenith angle averaged over the sunlit part of that interval. The fraction of the interval with the sun below the horizon SHALL contribute shade-level load in proportion to its length.

#### Scenario: Hour containing sunset
- **WHEN** an hourly value covers 19:00–20:00 and the sun sets at 19:40
- **THEN** the sun position used is the average over 19:00–19:40
- **AND** one third of the hour contributes the shade value

### Requirement: Agreement with minute-resolved physics
On synthetic clear-sky days at latitudes −35°, 0°, 23.4°, 41.3°, 60° and 64°, on the equinoxes and solstices, with dry-calm, humid and windy air, WBGT from interval-averaged inputs SHALL match the time mean of WBGT computed each minute with instantaneous sun and irradiance. The tolerance SHALL be 0.7 °C for hourly inputs and 0.2 °C for 15-minute inputs, at every interval including those containing sunrise or sunset.

#### Scenario: Sunrise hour
- **WHEN** the hour containing sunrise at the equator on 13 September is evaluated from its hourly-averaged irradiance
- **THEN** the result is within 0.7 °C of the mean of the minute-by-minute values

### Requirement: Six load levels
The load level SHALL be determined from WBGT rounded to the nearest whole degree (halves round up):

| Level | Rounded WBGT | Anchor |
|---|---|---|
| None | below 18 | no heat-load claims are made |
| Easy | 18–20 | MOE "almost safe" (below 21) |
| Noticeable | 21–24 | MOE "caution" (21–25) |
| Heavy | 25–27 | JSBM/MOE "warning" (25–28): take regular rests during labour and sport |
| Hard | 28–30 | JSBM/MOE "severe warning" (28–31): avoid direct sun outdoors; avoid heavy exercise |
| Dangerous | 31 and above | JSBM/MOE "danger" (31+): avoid outdoor activity; older people at risk even at rest |

Within Dangerous, rounded WBGT of 33 or more SHALL be marked as heat-stroke alert level, and 35 or more as special alert level, matching Japan MOE's alert thresholds.

The shade level comes from shade WBGT, the sun level from sun WBGT, and the worst level is the higher of the two while the sun is up.

#### Scenario: Level boundaries
- **WHEN** rounded WBGT values are 17, 18, 20, 21, 24, 25, 27, 28, 30 and 31
- **THEN** the levels are None, Easy, Easy, Noticeable, Noticeable, Heavy, Heavy, Hard, Hard and Dangerous

#### Scenario: Alert marks within Dangerous
- **WHEN** rounded WBGT is 34
- **THEN** the level is Dangerous and it is marked as heat-stroke alert level

### Requirement: Missing inputs degrade honestly
- When solar radiation is missing in daytime, the sun level SHALL be treated as unknown: no split headline and no sun claims, and the verdict uses the shade level.
- When only the direct/diffuse split is missing, the direct fraction SHALL be estimated from total radiation and the sun's position.
- When wind is missing, a light-wind value SHALL be assumed and no copy SHALL mention wind.
- When surface pressure is missing, a pressure SHALL be estimated from the location's elevation.
- When air temperature or humidity is missing, no WBGT SHALL be produced.

#### Scenario: Radiation missing at noon
- **WHEN** it is daytime and radiation is null
- **THEN** there is no shade/sun split and no sun wording anywhere on the screen

#### Scenario: Wind missing
- **WHEN** wind speed is null
- **THEN** WBGT is still produced and no copy mentions wind or breeze

### Requirement: Faithful to the reference globe and wet-bulb models
With the reference model's own globe diameter and surface albedo, the globe and natural wet-bulb calculations SHALL match the original Argonne implementation of the Liljegren model to within 0.1 °C. This SHALL hold over a test grid covering air temperatures 10–48 °C, relative humidity 5–100 %, wind 0–15 m/s, irradiance 0–1100 W/m², and solar elevations from below the horizon to overhead. The psychrometric wet bulb SHALL agree with the WMO psychrometer equation (WMO-No. 8, Annex 4.B), solved independently, to within 0.4 °C for 10–45 °C, 5–100 % relative humidity and 850–1013 hPa.

#### Scenario: Oracle comparison
- **WHEN** the reference-comparison test runs over the grid with reference parameters
- **THEN** every point is within 0.1 °C of the reference output

### Requirement: Accuracy against measured WBGT
The engine's accuracy SHALL be shown against measured data from Japan MOE stations that measure black-globe temperature. The test uses the same kind of forecast inputs the app uses (Open-Meteo historical forecasts at each station), with MOE-quality-controlled measured hours only. Accuracy SHALL be measured out of sample by leave-one-station-out cross-validation over every measured station: each station is predicted with parameters chosen without that station. Pooled over all stations, sun WBGT SHALL achieve:
- Mean absolute error of 1.2 °C or less.
- Mean bias within ±0.5 °C overall, and within ±1.0 °C in each 2 m wind band (below 1, 1–2, 2–4, 4 m/s and above) and each irradiance band (night, below 300, 300–700, 700 W/m² and above).
- The measured level, or one next to it, in at least 95 % of hours.
- Noticeable or lower in no more than 2 % of hours whose measured level is Hard or Dangerous.

The results, including every metric by station, band and level, SHALL be published in the repository and summarised on the About page.

#### Scenario: Out-of-fold stations
- **WHEN** the cross-validation pools every station's out-of-fold predictions
- **THEN** every metric above meets its threshold, or the run fails and reports which metric missed

#### Scenario: Severe under-warning is rare
- **WHEN** measured WBGT is 28 °C or higher at an out-of-fold station hour
- **THEN** the engine gives 25 °C or higher in at least 98 % of such hours

### Requirement: Calibration is limited and held out
At most two physical parameters SHALL be calibrated: the surface albedo seen by the globe, and a minimum 2 m wind speed. For each cross-validation fold they SHALL be chosen from the other stations only, by this decision rule: consider only the configurations that meet every accuracy threshold on those stations; take the lowest mean absolute error among them; within 0.02 °C of it, take the configuration closest to the reference values. The shipped parameters SHALL be chosen by the same rule from all stations. Every validation run, passing or not, SHALL be kept in a published run history.

#### Scenario: No tuning on the predicted station
- **WHEN** a fold predicts a station
- **THEN** the parameters used were chosen without reading any measured value from that station

#### Scenario: Run history
- **WHEN** a validation run completes
- **THEN** it is appended to the published run history with its result, even when it fails

### Requirement: Sanity against independent estimators
For daytime points on a test grid inside the Ono–Tonouchi regression's validity range, sun WBGT SHALL be within 2.0 °C of that regression for at least 95 % of points. Increasing temperature, humidity or irradiance with everything else fixed SHALL NOT lower shade or sun WBGT by more than 0.1 °C. That tolerance covers the discrete atmospheric stability classes of the wind profile, and stays below the level hysteresis margin.

#### Scenario: Monotonic response
- **WHEN** relative humidity increases from 40 % to 80 % with other inputs unchanged
- **THEN** neither shade nor sun WBGT falls by more than 0.1 °C

### Requirement: Performance
On a phone-class device (CPU throttled 4× in the test harness), the full calculation for one render SHALL complete in under 50 ms. That covers current shade and sun, all forecast hours, and the attribution needed by the explainer.

#### Scenario: Throttled render budget
- **WHEN** the performance test renders the main screen with a 7-day fixture under 4× CPU throttling
- **THEN** the load calculation takes less than 50 ms
