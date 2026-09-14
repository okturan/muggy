## Purpose

Explains what is behind the verdict in plain words: how much the damp, the sun and the breeze each add or take away, how the load is moving through the day, and what the level means for a person. It never contradicts the verdict.

## ADDED Requirements

### Requirement: "Why it feels like this" card
The card formerly titled "What it means" SHALL be titled "Why it feels like this". It SHALL contain, in order:
1. A factor breakdown.
2. At most two sentences about today's peak and the recent trend.
3. A small-print line with the rounded shade WBGT, and the rounded sun WBGT when the sun is up, linking to the explanation of WBGT on the About page.

The card SHALL be hidden when the load level is None or the load is unavailable.

#### Scenario: Card contents in daytime
- **WHEN** it is daytime with a load level of Noticeable
- **THEN** the card shows the factor breakdown, peak or trend wording, and small print with both shade and sun WBGT

#### Scenario: Hidden at None
- **WHEN** the worst load level is None
- **THEN** the "Why it feels like this" card is not shown

### Requirement: Factor breakdown adds up
The breakdown SHALL attribute the difference between the displayed WBGT and a reference WBGT to three factors: **damp**, **sun** and **breeze**. The reference is the same air temperature in dry, shaded air with a light breeze. The attribution SHALL be order-independent, and the three contributions SHALL sum to the total difference within 0.05 °C. Each factor SHALL be shown as a signed bar and a word bucket that reads as a sentence after the factor name (for example "no difference", "a bit worse", "much hotter", "helps") rather than a raw number. When the sun is down, the sun factor SHALL be omitted.

#### Scenario: Contributions sum to the total
- **WHEN** the breakdown is computed for any reachable input
- **THEN** damp + sun + breeze equals displayed WBGT minus reference WBGT within 0.05 °C

#### Scenario: Wind above skin temperature
- **WHEN** the air is 38 °C with strong wind
- **THEN** the breeze factor is not described as helping if its contribution is positive

### Requirement: Peak and trend sentences are level-gated
- Peak and trend sentences SHALL NOT appear when the headline level is Easy, unless a higher level is forecast later today. In that case one sentence SHALL name that level and the time it is first reached.
- "About as heavy as today gets" wording SHALL only appear at Noticeable or above.
- Any level named for a time other than now SHALL carry that time.

#### Scenario: Quiet morning ahead of a hard afternoon
- **WHEN** it is 10:30, the headline level is Easy, and Hard is forecast from 14:00
- **THEN** the card says the load reaches Hard by 14:00 and adds no other peak or trend sentence

#### Scenario: Dramatic wording suppressed at an easy level
- **WHEN** the headline level is Easy and now is today's peak
- **THEN** the card does not say this is as heavy as today gets

### Requirement: "Why this verdict?" sheet
Tapping the headline or a "Why?" control on the "Why it feels like this" card SHALL open a sheet explaining, in plain language and without jargon before the final section:
1. The verdict in one sentence.
2. What the air is (texture) and what that does to sweat.
3. The factor breakdown with a sentence per factor.
4. Shade versus sun, when they differ.
5. What the level means for different activities, paraphrasing the published guidance.
6. Where the numbers come from, including the WBGT values, the model name and a link to the About page.

The sheet SHALL be an accessible dialog: it takes focus, traps focus while open, closes on Escape and on backdrop tap, and returns focus to the control that opened it.

#### Scenario: Open and close with keyboard
- **WHEN** a keyboard user activates the "Why?" control and then presses Escape
- **THEN** the sheet opens with focus inside it, closes on Escape, and focus returns to the "Why?" control

#### Scenario: Sheet agrees with the screen
- **WHEN** the sheet is open
- **THEN** its verdict sentence, levels and numbers match the headline and card for the same reading
