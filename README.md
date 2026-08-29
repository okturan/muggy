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

The bar underneath is the local climate at a glance — one segment per band, sized by how much of the past
decade fell in it. Because the segments are sized by share, the marker at today's percentile lands inside
today's band automatically. Reykjavík's bar is 99% dry; Singapore's is 63% miserable.

### When to go out

The forecast already knows when the air gets bearable, so the app says it outright: the longest
continuous run of daylight hours at the best comfort band in the next 24 hours. When nothing is actually
good it says so — *"that is the least sticky it gets, and it is still muggy"* — rather than dressing up a
least-bad hour as a recommendation.

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
public/sprites/       Per-level animation strips sliced from the source sheets
tools/slice-sprites.py Cuts the two 2000×2000 spritesheets into those strips
design/               Design-canvas working files (.dc.html artboards + canvas.json)
sheet-boy.jpg         Source spritesheet — anime boy, 6 levels × 4 walk frames
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

**The character art** is two AI-generated spritesheets laid out as a 6-row grid, one row per comfort
band. The cloud sheet is shot on magenta, so `tools/slice-sprites.py` lifts the key by requiring red
*and* blue to sit well above green — which is what keeps the pink and red bodies out of the mask. The
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
