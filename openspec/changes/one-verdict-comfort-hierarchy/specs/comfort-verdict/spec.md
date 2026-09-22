## Purpose

Gives each screen a single verdict for how the outside air treats a person right now. The verdict combines heat load (from `heat-load`) with the kind of air (from `air-texture`). It sets the question order every other card follows, and the consistency rules no card may break.

## ADDED Requirements

### Requirement: One verdict, in a fixed order of questions
The app SHALL answer these questions in this order, each in exactly one place:
1. How is it out there for a body? (headline and blurb)
2. What kind of air is it? (a qualifier inside the verdict; the Air tile)
3. Do shade, sun or night change it? (a qualifier inside the verdict)
4. What is driving it and where is it heading? ("Why it feels like this" card)
5. Is this unusual here? ("Is this normal?" card)
6. When does it change? ("When will it get better?" card)

Only the headline and blurb SHALL state a verdict. Every other element MAY add detail but SHALL NOT state a different or opposing verdict.

#### Scenario: Only the headline gives a verdict
- **WHEN** the main screen has rendered with all cards visible
- **THEN** the headline and blurb are the only elements that state how the air treats a person overall
- **AND** no card heading repeats a verdict word in the role of an independent verdict

#### Scenario: Regression case from 13 September 2026
- **WHEN** texture is muggy, the shade load level is Easy and full sun is shining
- **THEN** the screen does not show both advice to slow down and a claim that nothing will slow the person down

### Requirement: Outdoor scope
All verdict, load and texture statements SHALL describe the outside air where a person stands outdoors. Copy SHALL NOT imply indoor conditions. Advice involving indoor cooling (air conditioning, fans, going indoors) SHALL appear only at night, or when the worst load level is Hard or Dangerous.

#### Scenario: Advice to go indoors is level-gated in daytime
- **WHEN** it is daytime and the worst load level is Noticeable
- **THEN** no copy on the screen advises going indoors or finding air conditioning

#### Scenario: Night copy may mention sleep
- **WHEN** it is night and texture is oppressive
- **THEN** the blurb may speak about sleep and moving air

### Requirement: Headline composition from load level and texture
The headline SHALL be chosen from a fixed composition table keyed by load level (None, Easy, Noticeable, Tiring, Hard, Dangerous) and texture band (dry, comfortable, humid, muggy, oppressive, miserable). The following rules SHALL apply:
- At None or Easy, texture leads the headline.
- At Easy, when texture is muggy or wetter, the headline SHALL carry a qualifier saying the load is mild (for example "Muggy but mild").
- At Noticeable, Tiring and Hard, load leads and texture appears only as a qualifier.
- At Dangerous, the headline SHALL state danger and SHALL NOT include a texture word.

#### Scenario: Muggy air at an easy load
- **WHEN** texture is muggy and both shade and sun levels are Easy
- **THEN** the headline reads as muggy but mild, not as a warning

#### Scenario: Dangerous load drops texture
- **WHEN** the worst load level is Dangerous and texture is dry
- **THEN** the headline states danger and does not contain the word "dry"

#### Scenario: Texture-led headline in cool weather
- **WHEN** the load level is None and texture is comfortable
- **THEN** the headline is the comfortable texture headline and makes no heat-load claim

### Requirement: Wording follows the air people actually feel
The levels SHALL never depend on it, but the wording SHALL take the air temperature and relative humidity into account where the dew point band alone would mislead:
- **Cool damp air.** At load None (or with no load), when texture is dry or comfortable, the air is below 18 °C and relative humidity is 80 % or more, the headline SHALL be "Cool and damp" (or "Cold and damp" below 8 °C) and the sentence SHALL say the air is damp but too cool to feel sticky.
- **No heat, no sweat talk.** At load None, dry and comfortable air SHALL be described without mentioning sweat or drinking.
- **Hot dry air is never fresh.** From 30 °C, Noticeable dry air SHALL read "Hot, dry air" and Noticeable comfortable air "Hot but not sticky". Dry and comfortable air at Easy or above SHALL NOT be called fresh in the blurb.
- **Hard is "hard going".** Humid, muggy, oppressive and miserable air at Hard SHALL read "<texture> and hard going".
- The Why sheet SHALL describe the air with the same sentence as the verdict.

#### Scenario: Foggy winter morning
- **WHEN** it is 6 °C at 95 % humidity with a dew point in the dry band and no heat load
- **THEN** the headline is "Cold and damp", not "Crisp and dry"

#### Scenario: Hot desert night
- **WHEN** it is 34 °C at 27 % humidity at 03:00, texture comfortable, load Noticeable
- **THEN** the headline is "Hot but not sticky" and the blurb does not say "fresh"

### Requirement: Shade and sun split
When the sun load level is higher than the shade load level and is Noticeable or above, the headline SHALL name both, in the form "<shade level> in the shade, <sun level> in the sun" (with a texture qualifier where the composition rules allow one). When the two levels are equal, or the sun level is Easy, the headline SHALL NOT mention shade or sun; a sun level of Easy carries no advice, so there is nothing for a split to say.

#### Scenario: Split headline
- **WHEN** the shade level is Easy and the sun level is Noticeable
- **THEN** the headline names Easy for shade and Noticeable for sun

#### Scenario: Easy sun over a None shade is not a split
- **WHEN** the shade level is None and the sun level is Easy
- **THEN** the headline is the texture-led Easy headline and mentions neither shade nor sun

#### Scenario: No split when the levels agree
- **WHEN** the shade and sun levels are both Tiring
- **THEN** the headline mentions neither shade nor sun

### Requirement: Night
Day and night for wording are decided by whether the sun is above the horizon at the current minute (the load itself averages over its data interval). When the sun is down, the sun load level SHALL equal the shade load level. No copy SHALL refer to sun, shade or the sun's strength. Texture copy SHALL use the night variant.

#### Scenario: Sunset clears sun wording
- **WHEN** the current reading is after sunset
- **THEN** no headline, blurb or card sentence mentions sun or shade

### Requirement: Blurb structure
The blurb SHALL be at most three sentences, in this order: what the air does to skin and sweat (texture), what the load means for the body (load), then the shade/sun or night qualifier when it applies. A sentence SHALL be omitted when it would add nothing (for example, the load sentence at load level None).

#### Scenario: Blurb order
- **WHEN** texture is humid, the shade level is Noticeable and the sun level is Tiring
- **THEN** the blurb's first sentence is about the air, the second about the body, and the third names the difference between shade and sun

### Requirement: Reassurance gating
Reassuring phrases (for example "nothing here will slow you down", "easy", "adds up to little") SHALL appear only when both the shade level and the sun level are Easy or None. At night only the shade level applies.

#### Scenario: Full sun blocks reassurance
- **WHEN** the shade level is Easy and the sun level is Noticeable
- **THEN** no copy on the screen contains an unqualified reassurance phrase
- **AND** reassurance may still appear when explicitly limited to the shade

### Requirement: Severity gating
Advice to change pace or activity SHALL be gated by the worst applicable level:
- "easy pace" style advice requires Noticeable or above.
- Breaks and water require Tiring or above.
- Avoiding exertion or direct sun requires Hard or above.
- Stopping activity and getting cool requires Dangerous.

Severity advice that applies only in the sun SHALL say so.

#### Scenario: No exertion warnings at a noticeable level
- **WHEN** the worst load level is Noticeable
- **THEN** no copy advises avoiding exertion or stopping activity

#### Scenario: Sun-only severity is labelled
- **WHEN** the shade level is Tiring and the sun level is Hard
- **THEN** any avoid-exertion advice is explicitly limited to being in the sun

### Requirement: Level mentions across the screen stay consistent
Any element other than the headline that names a load level different from the headline's SHALL tie it to a specific time ("around 15:00", "by 13:00") or place ("in full sun"), so it cannot be read as a claim about now.

#### Scenario: A time-tagged peak is allowed
- **WHEN** the headline level is Easy and today's peak is Tiring at 15:00
- **THEN** the "Why it feels like this" card may say the load reaches Tiring around 15:00
- **AND** it does not say "tiring" without the time

### Requirement: Printed numbers agree with their labels
Every number printed next to a level or band label SHALL, as printed (rounded), fall inside that label's range.

#### Scenario: Boundary rounding
- **WHEN** the shade WBGT is 20.6 °C
- **THEN** the printed value is 21 and the level shown next to it is Noticeable

### Requirement: Every reachable combination renders
The app SHALL define headline, blurb and qualifier copy for every combination of texture, shade level, sun level and day/night that the load engine can produce. Automated tests SHALL enumerate the combinations and fail if any reachable combination lacks copy or any copy breaks the gating requirements.

#### Scenario: Exhaustive copy check
- **WHEN** the composition test suite runs
- **THEN** every reachable combination produces a headline and blurb that pass reassurance, severity and scope gating

### Requirement: Level stability
During a session, a displayed load level SHALL change only once the unrounded WBGT has moved at least 0.3 °C past the rounding boundary between the two levels. The first render of a session and any change of place SHALL use the plain rounded level. Forecast hours compared with now (relief, peak and trend) SHALL be levelled relative to the held level with the same margin, so an hour whose reading equals now never reads as a change.

#### Scenario: No flicker at a boundary
- **WHEN** successive minute ticks give a shade WBGT of 20.4, 20.6, 20.5 and 20.7 °C, starting at Easy
- **THEN** the displayed level stays Easy on every tick

#### Scenario: A clear crossing changes the level
- **WHEN** the shade WBGT reaches 20.8 °C after being Easy
- **THEN** the displayed level becomes Noticeable

#### Scenario: A held level keeps its printed number inside its range
- **WHEN** the shade WBGT is 20.7 °C and the displayed level is still Easy
- **THEN** the small print shows WBGT 20, and the "Why this verdict?" sheet shows 20.7 °C and says the reading is on the line between two levels

### Requirement: Same moment everywhere
The headline, blurb, stat tiles, "Why it feels like this" card, relief window and the "now" cell of the hours strip SHALL all use the same interpolated current reading and the same level ranking.

#### Scenario: One now
- **WHEN** the minute tick updates the reading
- **THEN** every element listed above updates from the same reading in the same render

### Requirement: Titles, share text and link previews use the composed verdict
The document title, the share-sheet text and the server-rendered link preview for a city URL SHALL use the composed headline for that place and moment. The preview image SHALL remain the pre-rendered banner for the texture band. Preview descriptions SHALL call the texture "air", not "comfort".

#### Scenario: Link preview matches the app
- **WHEN** a link unfurler requests `muggy.fyi/tirana` at the same minute a visitor opens it
- **THEN** the preview title uses the same composed headline the app shows

### Requirement: Load unavailable
When the load cannot be calculated because air temperature is missing, the app SHALL show the texture headline and blurb without any load, shade/sun or severity claims, and SHALL hide the "Why it feels like this" card.

#### Scenario: Missing temperature
- **WHEN** the forecast has a dew point but no air temperature
- **THEN** the headline is texture-only and the "Why it feels like this" card is hidden
