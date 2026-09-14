## Purpose

Tells people when the outside air next gets meaningfully better. "Better" uses the same ranking as the verdict, so relief from sunset or cloud counts, not only relief from drier air.

## ADDED Requirements

### Requirement: Relief ranked by the composed verdict
Each forecast hour SHALL get a rank from its worst load level (sun level while the sun is up, shade level otherwise) first, and its texture band second. Relief SHALL be the first forecast hour after the current hour whose rank is lower than the current rank.

#### Scenario: Sunset counts as relief
- **WHEN** it is 17:00 in full sun at Real work, texture stays muggy all evening, and after 19:00 the level is Noticeable
- **THEN** the card reports relief from 19:00 and says it arrives as the sun goes down

#### Scenario: Drier air counts as relief
- **WHEN** the load level stays Noticeable and texture drops from oppressive to humid at 22:00
- **THEN** the card reports relief from 22:00 and says the air dries out

### Requirement: Texture relief at easy loads
When the current worst load level is None or Easy, relief SHALL be ranked by texture band alone, except that an hour whose load level is higher than now SHALL never be offered as relief.

#### Scenario: Drier but heavier is not relief
- **WHEN** it is 08:30 with muggy air at Easy, and from 12:00 the air is humid but the load is Real work
- **THEN** the card does not offer 12:00 as relief

#### Scenario: Easy muggy night
- **WHEN** it is 21:00, the load level is Easy, texture is muggy, and texture is comfortable from 23:00
- **THEN** relief is reported from 23:00 on the basis of texture

### Requirement: Night hours may extend but not open a window
Hours from 00:00 to 05:59 SHALL NOT be the opening hour of a relief window. They MAY extend a window that opened earlier. The window SHALL span consecutive forecast hours whose rank is no worse than the opening hour's (a missing hour ends it), and SHALL report where it bottoms out when it improves further within the run, naming a lower level or drier air, whichever changed.

#### Scenario: Window deepens overnight
- **WHEN** relief opens at 22:00 as Noticeable and reaches Easy with comfortable air by 02:00
- **THEN** the card says relief starts at 22:00 and eases further by 02:00

### Requirement: No relief
When no forecast hour in the next 24 has a lower rank, the card SHALL say nothing better is coming in that period. Its wording SHALL differ depending on whether the current state is already easy or still a burden.

#### Scenario: Already as good as it gets
- **WHEN** the current rank is the lowest of the next 24 hours and the load level is Easy
- **THEN** the card says the current air is as good as the next day gets

### Requirement: Relief wording agrees with the verdict
Relief wording SHALL use the same level and band names as the verdict, and SHALL tie every level it names to a time. The card tint SHALL be the texture band of the hour it points to (or of the bottom hour, when the window deepens).

#### Scenario: Time-tagged level
- **WHEN** the card names Easy as the relief level
- **THEN** the sentence also names the hour it applies from
