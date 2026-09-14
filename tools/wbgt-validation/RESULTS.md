# Heat-load engine: validation against measured WBGT

Generated 2026-09-14T10:37:02.220Z at commit `d8706bf-dirty`. Model: MOE definition; 150 mm globe with ISO 7726 convection.
Protocol: leave-one-station-out cross-validation over all measured stations. 47 stations, 434405 measured hours, 2022-05-01T00:00 to 2026-09-12T22:00 (JST). Every station's numbers below come from parameters chosen without that station.

**Result: meets the heat-load accuracy requirement.**

Shipped parameters (same rule, all stations): surface albedo **0.2**, minimum 2 m wind **0.13 m/s**. Fold choices: centred|0.2|0.13 × 47.

| Engine | hours | MAE °C | bias °C | globe MAE °C | level exact | within one level | severe under-warning |
|---|---|---|---|---|---|---|---|
| Muggy (out-of-fold) | 434405 | 0.79 | -0.16 | 2.19 | 78.0% | 99.8% | 0.1% of 75020 |
| MOE definition, reference parameters | 434405 | 0.85 | 0.05 | 2.41 | 76.7% | 99.7% | 0.1% of 75020 |
| ISO Liljegren (natural wet bulb, 2-inch globe) | 434405 | 1.18 | 0.53 | 2.15 | 70.4% | 98.1% | 0.0% of 75020 |
| Ono–Tonouchi (MOE estimator) | 434405 | 0.77 | 0.02 | – | 78.6% | 99.8% | 0.1% of 75020 |

## Radiation timing

MOE observations are instantaneous, at the top of the hour. The cross-validation aligned the forecast's hourly-mean radiation to that instant with a two-hour window centred on it ("centred"), which is the closer proxy for the app's current reading (a 15-minute step). The app's hourly series is a preceding-hour mean; scored with that alignment ("preceding", the forecast hour ending at the observation) the same parameters give MAE 0.81 °C, bias -0.18 °C, strong-sun bias 0.60 °C, 99.8% within one level. Parameters were chosen under the centred alignment; this figure is a sensitivity check, not a second fit.

## Muggy by condition (out-of-fold)

| 2 m wind (m/s) | hours | bias °C | MAE °C |
|---|---|---|---|
| <1 | 201046 | -0.20 | 0.78 |
| 1-2 | 151398 | -0.05 | 0.80 |
| 2-4 | 71752 | -0.24 | 0.81 |
| >=4 | 10209 | -0.35 | 0.81 |

| Irradiance (W/m²) | hours | bias °C | MAE °C |
|---|---|---|---|
| night | 176010 | -0.38 | 0.62 |
| <300 | 139460 | -0.19 | 0.76 |
| 300-700 | 86115 | 0.06 | 1.03 |
| >=700 | 32820 | 0.56 | 1.20 |

| Hour (JST) | hours | bias °C | MAE °C |
|---|---|---|---|
| 0 | 18055 | -0.38 | 0.61 |
| 1 | 18102 | -0.43 | 0.64 |
| 2 | 18101 | -0.46 | 0.68 |
| 3 | 18104 | -0.37 | 0.63 |
| 4 | 18107 | -0.39 | 0.66 |
| 5 | 18101 | -0.32 | 0.64 |
| 6 | 18102 | -0.12 | 0.63 |
| 7 | 18108 | -0.18 | 0.82 |
| 8 | 18108 | -0.17 | 0.94 |
| 9 | 18113 | 0.01 | 0.95 |
| 10 | 18084 | 0.10 | 1.03 |
| 11 | 18093 | 0.20 | 1.12 |
| 12 | 18109 | 0.24 | 1.12 |
| 13 | 18111 | 0.19 | 1.12 |
| 14 | 18108 | 0.12 | 1.10 |
| 15 | 18110 | 0.00 | 0.98 |
| 16 | 18111 | -0.08 | 0.92 |
| 17 | 18114 | -0.08 | 0.84 |
| 18 | 18117 | -0.06 | 0.63 |
| 19 | 18116 | -0.17 | 0.55 |
| 20 | 18115 | -0.32 | 0.60 |
| 21 | 18116 | -0.34 | 0.57 |
| 22 | 18113 | -0.39 | 0.60 |
| 23 | 17987 | -0.44 | 0.63 |

| Measured level | hours | bias °C | MAE °C | same level | within one |
|---|---|---|---|---|---|
| None | 65069 | -0.10 | 0.78 | 93.5% | 99.9% |
| Easy | 58827 | -0.09 | 0.77 | 74.3% | 99.9% |
| Noticeable | 117470 | -0.07 | 0.74 | 82.1% | 99.8% |
| Real work | 118019 | -0.24 | 0.73 | 76.8% | 99.9% |
| Hard | 57550 | -0.19 | 0.98 | 65.7% | 99.8% |
| Dangerous | 17470 | -0.61 | 1.10 | 53.4% | 99.3% |

## By station (out-of-fold)

Siting matters: a coastal observatory and a sheltered city yard see the same forecast grid cell differently. These are the numbers a visitor in each city would actually get.

| station | hours | MAE °C | bias °C | strong-sun bias °C |
|---|---|---|---|---|
| SAPPORO (14163) | 17919 | 0.98 | -0.20 | 0.70 |
| AOMORI (31312) | 6904 | 0.77 | 0.03 | 1.07 |
| AKITA (32402) | 6905 | 0.71 | -0.20 | 0.84 |
| MORIOKA (33431) | 6841 | 0.75 | 0.32 | 1.25 |
| SENDAI (34392) | 17922 | 0.88 | -0.36 | 0.52 |
| YAMAGATA (35426) | 6909 | 0.89 | 0.49 | 2.28 |
| FUKUSHIMA (36127) | 6896 | 0.76 | 0.26 | 1.59 |
| MITO (40201) | 6907 | 0.69 | -0.26 | 0.20 |
| UTSUNOMIYA (41277) | 6896 | 0.87 | -0.42 | 0.60 |
| MAEBASHI (42251) | 6892 | 0.70 | 0.15 | 1.22 |
| KUMAGAYA (43056) | 6855 | 0.70 | -0.26 | 0.49 |
| TOKYO (44132) | 17923 | 0.84 | -0.13 | 1.03 |
| CHOSHI (45148) | 6909 | 1.01 | -0.59 | -1.75 |
| YOKOHAMA (46106) | 6906 | 0.75 | -0.21 | 1.19 |
| NAGANO (48156) | 6909 | 0.71 | -0.02 | 1.03 |
| KOFU (49142) | 6907 | 0.83 | -0.06 | 1.09 |
| SHIZUOKA (50331) | 6908 | 0.71 | -0.22 | 0.72 |
| NAGOYA (51106) | 17921 | 0.84 | -0.42 | 0.70 |
| GIFU (52586) | 6908 | 0.76 | 0.28 | 1.74 |
| TSU (53133) | 6803 | 0.70 | -0.29 | 0.39 |
| NIIGATA (54232) | 17919 | 0.80 | -0.32 | -0.16 |
| TOYAMA (55102) | 6907 | 0.67 | -0.12 | 0.61 |
| KANAZAWA (56227) | 6909 | 0.67 | -0.25 | 0.03 |
| FUKUI (57066) | 6909 | 0.69 | 0.00 | 1.03 |
| HIKONE (60131) | 6908 | 0.81 | -0.39 | -0.93 |
| KYOTO (61286) | 6909 | 0.77 | 0.02 | 1.64 |
| OSAKA (62078) | 17921 | 0.82 | -0.17 | 0.95 |
| KOBE (63518) | 6909 | 0.76 | 0.05 | 1.71 |
| NARA (64036) | 6909 | 0.67 | -0.01 | 1.23 |
| WAKAYAMA (65042) | 6909 | 0.63 | -0.17 | 0.67 |
| OKAYAMA (66408) | 6888 | 0.69 | -0.31 | 0.60 |
| HIROSHIMA (67437) | 14249 | 0.98 | 0.78 | 2.36 |
| MATSUE (68132) | 6858 | 0.86 | 0.15 | 1.99 |
| TOTTORI (69122) | 6908 | 0.70 | -0.24 | 0.30 |
| TOKUSHIMA (71106) | 6909 | 0.66 | -0.25 | 0.33 |
| TAKAMATSU (72086) | 6904 | 0.75 | -0.37 | 0.50 |
| MATSUYAMA (73166) | 6908 | 0.75 | -0.22 | 0.63 |
| KOCHI (74182) | 10575 | 0.73 | -0.02 | 1.13 |
| SHIMONOSEKI (81428) | 6909 | 0.69 | -0.34 | 0.20 |
| FUKUOKA (82182) | 17920 | 0.97 | -0.70 | -1.60 |
| OITA (83216) | 6877 | 0.71 | -0.30 | -0.43 |
| NAGASAKI (84496) | 6909 | 0.71 | 0.42 | 1.42 |
| SAGA (85142) | 6909 | 0.81 | -0.08 | 1.45 |
| KUMAMOTO (86141) | 6909 | 0.68 | -0.01 | 1.02 |
| MIYAZAKI (87376) | 6909 | 0.61 | -0.07 | 0.34 |
| KAGOSHIMA (88317) | 17905 | 0.79 | -0.38 | -0.45 |
| NAHA (91197) | 17910 | 0.80 | -0.45 | -0.63 |

## Run history

Every validation run is listed, passing or not. Runs 1 and 2 used one fixed train/held-out split; changes between runs were motivated by training-station evidence only, and the protocol then moved to leave-one-station-out cross-validation so that no single split is re-used.

| run | date | protocol | model | albedo | min wind | MAE | bias | strong-sun bias | passes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-13 | fixed split (held-out stations) | MOE definition; 150 mm globe with Liljegren forced-only sphere convection | 0.25 | 0.13 | 0.88 | 0.07 | 1.47 | no: sun >=700 bias 1.469 outside ±1.0 |
| 2 | 2026-09-13 | fixed split (held-out stations) | MOE definition; 150 mm globe with ISO 7726 convection | 0.45 | 0.13 | 0.85 | 0.00 | 1.11 | no: sun >=700 bias 1.113 outside ±1.0 |
| 3 | 2026-09-14 | leave-one-station-out cross-validation over all measured stations | MOE definition; 150 mm globe with ISO 7726 convection | 0.2 | 0.13 | 0.79 | -0.16 | 0.56 | yes |

## Data

- Measured WBGT: Japan Ministry of the Environment, Heat Illness Prevention Information (wbgt.env.go.jp); stations with a measured 6-inch black globe, quality flag 4 (all inputs observed).
- Inputs: Open-Meteo Historical Forecast API (CC BY 4.0), the same variables the app uses.
- Reproduce: `node tools/wbgt-validation/fetch.mjs && node tools/wbgt-validation/dataset.mjs && node tools/wbgt-validation/crossval.mjs && node tools/wbgt-validation/validate.mjs`.
