/**
 * Air texture: what the moisture does, from the dew point.
 * WeatherSpark's comfort thresholds (55/60/65/70/75 °F) in °C.
 */
export const TEXTURE_BANDS = [
  { id: 'dry', max: 12.8 },
  { id: 'comfortable', max: 15.6 },
  { id: 'humid', max: 18.3 },
  { id: 'muggy', max: 21.1 },
  { id: 'oppressive', max: 23.9 },
  { id: 'miserable', max: Infinity },
];
export const TEXTURES = TEXTURE_BANDS.map((b) => b.id);
export const TEXTURE_RANK = Object.fromEntries(TEXTURES.map((id, i) => [id, i]));

export const textureOf = (dewPointC) => TEXTURE_BANDS.find((b) => dewPointC < b.max).id;
