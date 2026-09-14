## Purpose

The About page is the full, friendly explanation of how Muggy reaches its verdict: the two readings, the level ladder and its sources, how shade and sun are modelled, an explorer to try it yourself, and the required credits.

## ADDED Requirements

### Requirement: Two readings, one verdict
The About page SHALL explain in plain language that Muggy reads two things: what kind of air it is (dew point bands), and how heavy the air sits on a body (heat load). It SHALL explain why the load leads the verdict and the air qualifies it. It SHALL include a visual grid of air bands against load levels that shows which combinations happen and which cannot, with "muggy but mild" as the worked example.

#### Scenario: Grid present
- **WHEN** a visitor opens the About page
- **THEN** a band-by-level grid is shown with impossible combinations visibly marked and a worked "muggy but mild" example

### Requirement: Level ladder with sources
The page SHALL present the six load levels with their WBGT ranges, what each means for light, moderate and heavy activity, and the published guidance each is anchored to. Sources SHALL be cited and linked: the Japanese Society of Biometeorology daily-life guideline and the Japan Ministry of the Environment WBGT table. The ladder SHALL use the same ranges the app uses.

#### Scenario: Ranges match the app
- **WHEN** the page's ladder is compared with the app's level thresholds by an automated test
- **THEN** every range matches

### Requirement: WBGT and shade versus sun in plain words
The page SHALL explain WBGT without formulas up front. It is a single number blending a wet thermometer (how well sweat can cool you), a black globe in the sun (how much the sun and hot surfaces load you) and the air temperature. The page SHALL say what "in the shade" and "in the sun" mean in the app. It SHALL state that the model is calculated from forecast data for a grid cell several kilometres wide, not measured on the person's street. It SHALL note that age, acclimatisation, clothing and activity change personal risk. Formulas and model details MAY follow in a clearly marked technical section.

#### Scenario: Plain-language first
- **WHEN** a visitor reads the WBGT section from the top
- **THEN** the first explanation contains no formula, and a technical section follows below it

### Requirement: Interactive explorer
The page SHALL provide an explorer with controls for air temperature, air texture (dew point band), sun (none, some, full) and wind (still, breeze, windy). It SHALL show the resulting headline, shade and sun levels, and factor breakdown, using the same calculation and copy as the app. The explorer SHALL be operable by keyboard and screen reader.

#### Scenario: Explorer matches the app
- **WHEN** the explorer is set to inputs equivalent to a fixture forecast
- **THEN** it shows the same headline and levels the main screen shows for that fixture

#### Scenario: Keyboard operation
- **WHEN** a keyboard-only user tabs through the explorer
- **THEN** every control can be reached and changed, and the result is announced

### Requirement: Correcting earlier explanations
The page SHALL replace the humidex section with the new explanation. It SHALL briefly say that earlier versions used humidex, and why the verdict now uses a model that includes sun and wind. Structured FAQ data on the page SHALL match the visible text.

#### Scenario: FAQ data consistent
- **WHEN** the page's structured FAQ data is compared with the visible answers
- **THEN** no answer mentions humidex as the current method, and the band and level ranges match

### Requirement: Credits and acknowledgment
The page SHALL credit Open-Meteo for weather data, WeatherSpark for the band thresholds, and James C. Liljegren and Argonne National Laboratory for the WBGT model. It SHALL include the acknowledgment required by the model's licence: "This product includes software produced by UChicago Argonne, LLC under Contract No. DE-AC02-06CH11357 with the Department of Energy."

#### Scenario: Acknowledgment present
- **WHEN** the About page renders
- **THEN** the Argonne acknowledgment text appears verbatim
