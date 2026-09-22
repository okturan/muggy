## Purpose

Tells people whether the current stickiness is unusual for this place, this time of year and this time of day. Every statement on the card is based on one comparison and states one statistic.

## ADDED Requirements

### Requirement: One comparison basis
The card SHALL compare the current dew point with past hourly dew points from the same place. The comparison set is hours within ±7 days of today's date and within ±2 hours of the current local hour of day, over the last ten years. The sub-heading, verdict, body sentence and climate bar SHALL all use this single set.

#### Scenario: Heading and body agree
- **WHEN** the current dew point is stickier than 89 % of the comparison set
- **THEN** the sub-heading states 89 %, and the body adds context without a second percentage

### Requirement: Time-of-day wording
Percentages SHALL name the part of the day the comparison covers: morning (05:00–11:59), afternoon (12:00–16:59), evening (17:00–21:59) or night (22:00–04:59), for example "stickier than 89% of mornings around this date".

#### Scenario: Morning wording
- **WHEN** the local time is 10:30
- **THEN** the statistic refers to mornings

### Requirement: Verdict wording and extremes
The card verdict SHALL be "Way stickier than usual" at or above the 90th percentile, "Stickier than usual" at 70–89, "About normal" at 31–69, "Drier than usual" at 11–30 and "Way drier than usual" at 10 or below. Dry and comfortable air is not sticky at any percentile, so for those bands "stickier" SHALL read "damper". At or above the 99th percentile the statistic SHALL name the stickiest (or dampest) such hours on record, and at or below the 1st the driest.

The body SHALL describe a rare band by how it feels ("Air this dry is rare here at this time of year"), never by its band name, which reads as a claim about the place. When the headline calls cool air damp and the verdict is drier than usual, the body SHALL say the air holds less water than usual even though it feels damp.

#### Scenario: Record-level stickiness
- **WHEN** the current dew point exceeds every value in the comparison set
- **THEN** the sub-heading names the stickiest hours of that part of the day on record

#### Scenario: Winter air
- **WHEN** the band is dry and the dew point is above 90 % of the comparison set
- **THEN** the verdict reads "Way damper than usual" and the card never says "sticky"

### Requirement: Climate bar on the same basis
The climate bar SHALL size each band segment by that band's share of the comparison set. The marker SHALL sit at the current percentile, so it falls inside the current band.

#### Scenario: Marker inside band
- **WHEN** the current band is muggy
- **THEN** the marker is drawn within the muggy segment

### Requirement: Normals API contract
`GET /api/normals?lat&lon` SHALL return, for the requested place and today's date:
- The number of years used.
- For each local hour of day 0–23, a 101-point quantile ladder of dew point and the band shares of its ±2-hour, ±7-day comparison set, with its sample count.

The endpoint SHALL return 400 without coordinates. It SHALL return 503 when fewer than five years of history are available or when any hour's comparison set has fewer than 200 samples. Responses SHALL be cached under a new cache key version so earlier-shaped responses are never served to the new client.

#### Scenario: Missing coordinates
- **WHEN** the endpoint is called without lat and lon
- **THEN** it responds 400

#### Scenario: Hour ladders present
- **WHEN** the endpoint succeeds
- **THEN** the body contains 24 hour entries, each with a 101-value ladder, band shares and a sample count of at least 200

#### Scenario: Card hidden without usable normals
- **WHEN** the endpoint fails or the response lacks hour ladders
- **THEN** the "Is this normal?" card stays hidden and the rest of the screen is unaffected
