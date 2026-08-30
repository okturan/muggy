# Muggy

**How sticky is it out there?** A small mobile-first weather app that answers the one question ordinary
weather apps bury: not how hot it is, but how *unpleasant* the air feels — and it puts a pixel cloud
in a jacket on the front of it.

🌦️ **Live: [muggy.okan.workers.dev](https://muggy.okan.workers.dev)**

<img src="design/cloud-muggy.png" width="120" alt="the muggy cloud">

## What it actually tells you

Temperature and humidity on their own are a bad guide to how the air feels. 30 °C at 30% humidity is
pleasant; 27 °C at 80% is miserable. The honest measure is the **dew point**, and it sorts cleanly into
six comfort bands:

| Band | Dew point | How it feels |
|---|---|---|
| dry | below 12.8 °C | Crisp. Skin and lips feel it. |
| comfortable | 12.8 – 15.6 °C | The good stuff. Go outside. |
| humid | 15.6 – 18.3 °C | Noticeable, not a problem. |
| muggy | 18.3 – 21.1 °C | Shirts stick. Shade helps. |
| oppressive | 21.1 – 23.9 °C | Sweat won't dry. Take it slow. |
| miserable | 23.9 °C and up | Stay in. Find the AC. |

These are the comfort thresholds [WeatherSpark](https://weatherspark.com) popularised (55/60/65/70/75 °F),
converted to Celsius. The app shows you **temperature, humidity and the band** — the dew point itself
does the work behind the scenes and is never put on screen, because "21° dew point" means nothing to
most people and "muggy" means everything.

Each band has its own paper tint and its own mood for the character, so the whole screen changes colour
with the weather.

### Is this normal?

A band on its own doesn't tell you whether to be surprised. The app compares the current reading against
**ten years of history for this location and this date** (a ±7-day window, so ~3,600 hours of past
weather) and tells you where today sits: *"Stickier than 88% of the hours recorded here around this date
over the last 10 years. Normally around now: humid."*

It also ranks today against every individual past day in that window — *"stickier than 93% of days"* —
rather than against a per-year average, which would flatter it: one sticky day clears a smoothed
fortnight median easily.

The bar underneath is the local climate at a glance — one segment per band, sized by how much of the past
decade fell in it. Because the segments are sized by share, the marker at today's percentile lands inside
today's band automatically. Reykjavík's bar is 99% dry; Singapore's is 63% miserable.

The wording has to work when the current band *is* the normal band, which is the common case: saying
"stickier than usual — normally humid" while it is humid reads as a contradiction. So the band sentence
describes position within the band ("still the usual humid band, but at the sticky end of it") whenever
the two agree.

### What it means

A comfort band is deliberately moisture-only, so 20 °C dew point reads *muggy* at four in the afternoon
and at midnight alike — while the body plainly disagrees, because the air is ten degrees cooler and the
sun has gone. So a second axis: **Humidex**, Environment Canada's discomfort index, `T + 0.5555·(e − 10)`
with `e` the vapour pressure from the dew point. Built from the same dew point everything else runs on,
adding exactly the missing term. Its bands are official: under 30 little discomfort, 30–39 some, 40–45
great, 45+ dangerous.

One Tirana evening it read *humidex 37, some discomfort*, against a peak of *42, great discomfort* at
13:00 — the same sticky air, a whole band easier once the sun was down.

Two better-known frameworks were considered and rejected for this app:

- **WBGT** models solar load properly, but needs a globe temperature and a *natural* wet bulb — not the
  psychrometric one the API returns. Both would have to be approximated.
- **UTCI** is the most rigorous of all, and needs mean radiant temperature plus a ~200-term polynomial.

Either would mean showing a precise-looking number that was quietly guessed. The sun is handled
separately and honestly instead, from `is_day` and the actual `shortwave_radiation`.

### When will it get better

The forecast already knows when the air gets bearable, so the app says it outright: the first stretch in
the next 24 hours that is a band better than right now, and where that stretch bottoms out — *"Muggy from
22:00, easing to dry by 03:00."* When nothing is actually better it says so rather than dressing up a
least-bad hour as a recommendation.

Evenings and nights count, which took two goes to get right. Searching only daylight hours told someone
at 20:30 that nothing better was coming, while 23:00 was humid and midnight was comfortable — two bands
down and visible in the hours strip directly below the claim. Night hours can no longer *open* a window,
since nobody plans around 03:00, but they can extend one, which is what lets the card follow the air down
past midnight.

## Where the data comes from

[Open-Meteo](https://open-meteo.com/) — ERA5-based reanalysis and forecast, CC-BY 4.0, no API key needed
for non-commercial use.

WeatherSpark is **not** used as a data source. They have no public API, and their terms prohibit
automated access to their underlying data and its redistribution. Only their published band thresholds
are used, which is a description of how humid air feels rather than anything proprietary.

> Note: Open-Meteo's free tier is non-commercial. Adding ads or subscriptions would mean getting an API
> key from them — a one-line change in the Worker.

## How it's built

A single Cloudflare Worker serving static assets, with a thin cached proxy in front of Open-Meteo so the
upstream never sees end users and repeated lookups are close to free.

```
src/index.js          Worker: /api/forecast, /api/geocode, everything else → static assets
public/               The app — vanilla HTML/CSS/JS, no framework, no build step
public/sprites/       Per-band animation strips sliced from the source sheet
tools/slice-sprites.py Cuts the spritesheet into those strips
design/               Design-canvas working files (.dc.html artboards + canvas.json)
sheet-cloud.jpg       Source spritesheet — pixel cloud, 6 levels × 6 frames, magenta keyed
```

**API**

| Route | Cache | Notes |
|---|---|---|
| `GET /api/forecast?lat=&lon=` | 15 min | Edge cache; coordinates snapped to ~1 km so neighbours share an entry |
| `GET /api/geocode?q=` | 24 h | City search |
| `GET /api/normals?lat=&lon=` | 200 d, KV | Ten years of climatology for today's date |

`/api/normals` costs ten upstream archive calls on a miss, so it is cached in **KV** rather than the edge
cache — the edge cache is per-colo, which would multiply that by the number of data centres your users
happen to hit. The key is location (snapped to ~55 km, since dew-point climatology varies slowly) plus
day-of-year, and the TTL is under a year so each date naturally refreshes with the newest year folded in.
It returns a 101-point quantile ladder rather than raw hours, which is what lets the client place today's
reading as a percentile without the dew point ever reaching the screen.

**The character art** is an AI-generated spritesheet laid out as a 6-row grid, one row per comfort
band, shot on magenta. `tools/slice-sprites.py` keys it on **distance from the measured plate colour**,
not on a hue rule. A hue rule looks like it works and does not: the saturated pink of the `oppressive`
body is (240, 59, 163), which clears every "red and blue well above green" threshold you would write, so
it gets erased with the background and the character comes out hollow. Distance sees it correctly — that
pink sits ~115 from the plate while the plate clusters under 40, with almost nothing in between. The
foreground is then eroded 2px, because JPEG smears the key into sprite edges and a magenta halo is far
more visible after downscaling than a hair of lost outline. Cells come from gutters in the alpha
projection rather than a fixed grid (sun hats and the heatwave sign make the columns uneven), and every
frame is bottom-aligned on a common ground line so feet stay planted while accessories overhang.

The app animates each strip with `steps(n)` and a percentage `background-position`, which must run to
`n/(n-1)*100%` — 120% for six frames — so the last step lands on the last frame rather than past it.
Since each band now has its own body colour, large fills behind the character use a paler variant of
the band tint; the saturated version stays on chips, hour cells and week bars.

## Running it

```bash
npm install
npm run dev      # wrangler dev → http://localhost:8787
npm run deploy   # wrangler deploy
npm run sprites  # re-slice the spritesheets (needs Python + Pillow)
```

`wrangler.jsonc` carries a Cloudflare `account_id`. That's an identifier, not a credential — it does
nothing without an API token — but swap it for your own if you fork this.

## Credits

Weather data by [Open-Meteo](https://open-meteo.com/) (CC-BY 4.0). Comfort bands after
[WeatherSpark](https://weatherspark.com). Type is [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)
and [Nunito](https://fonts.google.com/specimen/Nunito).
