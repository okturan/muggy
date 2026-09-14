## Purpose

Describes what kind of air it is, how damp and how well sweat dries, using six dew point bands. It keeps that description strictly separate from advice about heat load and activity.

## ADDED Requirements

### Requirement: Six dew point bands
The texture band SHALL be determined from the dew point using these upper limits: dry below 12.8 °C, comfortable below 15.6 °C, humid below 18.3 °C, muggy below 21.1 °C, oppressive below 23.9 °C, miserable at 23.9 °C and above. The dew point number SHALL NOT be displayed.

#### Scenario: Band edges
- **WHEN** dew points of 12.7, 12.8, 18.3 and 23.9 °C are classified
- **THEN** the bands are dry, comfortable, muggy and miserable

### Requirement: Texture copy describes only the air
Texture wording (texture headlines, texture sentences in the blurb, band descriptions) SHALL describe only skin, lips, sweat and how well it dries, the feel of the air, and at night, sleep. It SHALL NOT give activity advice. That includes pace, exertion, rest, shade, sun, going indoors and air conditioning. The one exception: hydration advice is allowed for the dry band, because dry air dehydrates regardless of heat.

#### Scenario: Muggy daytime texture sentence
- **WHEN** texture is muggy in daytime
- **THEN** the texture sentence talks about shirts sticking or sweat drying slowly
- **AND** it does not tell the person to slow down or keep to the shade

#### Scenario: Automated lexicon check
- **WHEN** the copy test suite scans every texture string
- **THEN** none contains activity-advice terms, apart from hydration terms in the dry band

### Requirement: Air tile
The stat tile that shows the texture band SHALL be labelled "Air" and show the band name.

#### Scenario: Tile label
- **WHEN** the main screen renders
- **THEN** the three stat tiles read Temp, Humidity and Air

### Requirement: Character, colour and banner follow texture
The cloud character's sprite, the screen's colour tint, the level chip and the link-preview banner image SHALL be chosen by texture band.

#### Scenario: Sprite by band
- **WHEN** texture is oppressive and the load level is Easy
- **THEN** the oppressive sprite and tint are shown

### Requirement: Hours strip and week are stickiness timelines
The hours strip and the week view SHALL colour each cell by texture band. Their sub-headings SHALL describe stickiness only and SHALL NOT use load-level words.

#### Scenario: Hours sub-heading
- **WHEN** the hours strip renders
- **THEN** its sub-heading names the stickiest hour and its band, and contains no load-level word
