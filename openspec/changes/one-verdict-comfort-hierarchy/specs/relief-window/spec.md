## Purpose

Tells people when the outside air next gets meaningfully better. "Better" uses the same ranking as the verdict, so relief from sunset or cloud counts, not only relief from drier air.

## ADDED Requirements

### Requirement: Relief ranked by the composed verdict
Each forecast hour SHALL get a rank from its worst load level (sun level while the sun is up, shade level otherwise) first, and its texture band second. Relief SHALL be the first forecast hour after the current hour whose rank is lower than the current rank.

#### Scenario: Sunset counts as relief
- **WHEN** it is 17:00 in full sun at Tiring, texture stays muggy all evening, and after 19:00 the level is Noticeable
- **THEN** the card reports relief from 19:00 and says it arrives as the sun goes down

#### Scenario: Drier air counts as relief
- **WHEN** the load level stays Noticeable and texture drops from oppressive to humid at 22:00
- **THEN** the card reports relief from 22:00 and says the air dries out

### Requirement: Texture relief at easy loads
When the current worst load level is None or Easy, relief SHALL be ranked by texture band alone, except that an hour whose load level is higher than now SHALL never be offered as relief.

#### Scenario: Drier but heavier is not relief
- **WHEN** it is 08:30 with muggy air at Easy, and from 12:00 the air is humid but the load is Tiring
- **THEN** the card does not offer 12:00 as relief

#### Scenario: Easy muggy night
- **WHEN** it is 21:00, the load level is Easy, texture is muggy, and texture is comfortable from 23:00
- **THEN** relief is reported from 23:00 on the basis of texture

### Requirement: Night hours may extend but not open a window
Hours from 00:00 to 05:59 SHALL NOT be the opening hour of a relief window. They MAY extend a window that opened earlier. The window SHALL span consecutive forecast hours that stay better than now (a missing hour ends it), and SHALL report where it bottoms out when it improves further within the run, naming a lower level or drier air, whichever changed. A lone hour that is better only because the air is slightly drier SHALL NOT open a window; it is the forecast wobbling across a band edge. A lone cooler hour SHALL be reported as "around" that hour, not "from" it. A window that reaches the end of the 24 hours looked at SHALL be reported as "from" its start, since its end is unknown. Sunset SHALL only be given as the reason when the window opens at 12:00 or later.

#### Scenario: Window deepens overnight
- **WHEN** relief opens at 22:00 as Noticeable and reaches Easy with comfortable air by 02:00
- **THEN** the card says relief starts at 22:00 and eases further by 02:00

### Requirement: No relief
When no forecast hour in the next 24 has a lower rank, the card SHALL say nothing better is coming in that period, and SHALL NOT answer "When will it get better?" with "Right now". At an easy load it SHALL say the air stays in its band ("Stays muggy"); otherwise "No relief yet".

When the air is already dry or comfortable and the load is Easy or None, there is nothing to wait for and the card SHALL NOT be shown.

#### Scenario: Muggy and staying muggy
- **WHEN** the air is muggy at an easy load and no hour in the next 24 is drier
- **THEN** the card reads "Stays muggy"

#### Scenario: Nothing to wait for
- **WHEN** the air is comfortable and the load is Easy
- **THEN** the card is hidden

### Requirement: Relief wording agrees with the verdict
Relief wording SHALL use the same level names as the verdict, and SHALL tie every level it names to a time. When the load leads, the air SHALL be described as drying out rather than by band name, because a band such as "oppressive" reads as bad news even when it is a step down. The card tint SHALL be the texture band of the hour it points to (or of the bottom hour, when the window deepens).

#### Scenario: Time-tagged level
- **WHEN** the card names Easy as the relief level
- **THEN** the sentence also names the hour it applies from
