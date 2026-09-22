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
The breakdown SHALL attribute the difference between the displayed WBGT and a reference WBGT to three factors: **damp**, **sun** and **breeze**. The reference is the same air temperature in dry, shaded air with a light breeze. The attribution SHALL be order-independent, and the three contributions SHALL sum to the total difference within 0.05 °C. When the sun is in play the card SHALL first show two labelled boxes, "In the shade" and "In the sun", each with its held level. It SHALL then state the breakdown as one or two plain sentences, naming the largest cause first and leaving out factors that make no difference; the "Why this verdict?" sheet gives a sentence per factor. When the sun is down, the sun factor SHALL be omitted.

#### Scenario: Contributions sum to the total
- **WHEN** the breakdown is computed for any reachable input
- **THEN** damp + sun + breeze equals displayed WBGT minus reference WBGT within 0.05 °C

#### Scenario: Wind above skin temperature
- **WHEN** the air is 38 °C with strong wind
- **THEN** the breeze factor is not described as helping if its contribution is positive

### Requirement: Peak and trend sentences are level-gated
- Peak and trend sentences SHALL NOT appear when the headline level is Easy, unless a higher level is forecast later today. In that case one sentence SHALL name that level and the time it is first reached ("By 14:00 it's hard.").
- "It doesn't get worse than this today" wording SHALL only appear at Noticeable or above.
- Any level named for a time other than now SHALL carry that time.
- The card SHALL make one statement about the rest of today. The hourly trend ("It has been easing over the past hour") SHALL only be added when now is today's peak level and the load fell by at least 1 °C over the last hour. A rise inside the current level SHALL NOT be mentioned, so no sentence contradicts another.

#### Scenario: Easing is said once
- **WHEN** the load was Hard at 12:00, is Tiring at 17:05, and fell 1.3 °C over the last hour
- **THEN** the card says it was hard around 12:00 and has eased since, and nothing more

#### Scenario: No contradiction after the peak
- **WHEN** the load was Dangerous at 14:00 and is Tiring at 23:45, and rose 1.4 °C over the last hour
- **THEN** the card says it has eased since 14:00 and does not say it is still climbing

#### Scenario: Quiet morning ahead of a hard afternoon
- **WHEN** it is 10:30, the headline level is Easy, and Hard is forecast from 14:00
- **THEN** the card says the load reaches Hard by 14:00 and adds no other peak or trend sentence

#### Scenario: Dramatic wording suppressed at an easy level
- **WHEN** the headline level is Easy and now is today's peak
- **THEN** the card does not say this is as heavy as today gets

### Requirement: The cause in one sentence
The card SHALL state the breakdown as one or two sentences: the biggest cause first ("Most of this is the sun"), causes more than half its size as sharing it ("The damp and the sun share this about equally"), smaller ones "with a little from", and helpers after. Lists of three SHALL use commas ("The damp, the sun and the lack of wind"). A positive breeze share SHALL be named "the lack of wind" when the wind is light and "the wind" when it blows; a negative one "the breeze" or, in light wind, "the calm air". The two shade and sun boxes SHALL only show when the two levels differ.

#### Scenario: Three causes
- **WHEN** the damp, the sun and too little wind each add about the same load
- **THEN** the card reads "The damp, the sun and the lack of wind share this about equally."

#### Scenario: Equal levels
- **WHEN** the sun is up and the shade and sun levels are both Tiring
- **THEN** the two boxes are hidden

### Requirement: "Why this verdict?" sheet
Tapping the "Why this verdict?" control under the headline SHALL open a sheet explaining, in plain language and without jargon before the final section:
1. The verdict in one sentence.
2. What the air is (texture), in the same sentence the verdict uses, and what that does to sweat.
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
