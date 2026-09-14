import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classesIn, isHydrationOnly } from '../public/lib/lexicon.js';

const has = (text, cls) => classesIn(text).has(cls);

test('each class matches its examples', () => {
  const positives = {
    reassurance: ['Nothing here will slow you down.', 'The heat adds up to very little.', 'Barely registers.'],
    pace: ['Keep the pace easy.', 'Take it slower than usual.', 'Slow everything down.'],
    restWater: ['Take regular breaks.', 'Keep water on you.', 'Drink more than you feel like.'],
    avoidExertion: ['Avoid heavy exercise.', 'Avoid direct sun outdoors.', 'Skip the run.'],
    stopCool: ['Stop and cool down right away.', 'Get somewhere cool.', 'This is heat stroke territory.'],
    indoor: ['Stay in.', 'Find air conditioning.', 'A fan pointed at the bed is the move.', 'Head indoors.'],
    sunShade: ['In full sun it is real work.', 'Keep to the shade.'],
    loadLevel: ['Easy in the shade', 'Real work in the sun', 'Dangerous heat'],
  };
  for (const [cls, list] of Object.entries(positives)) {
    for (const text of list) assert.ok(has(text, cls), `${cls} should match "${text}"`);
  }
});

test('and does not match lookalikes', () => {
  const negatives = {
    reassurance: ['Shirts start sticking.', 'Sweat is slow to dry.'],
    pace: ['Sweat is slow to dry.', 'The air eased after dark.'],
    restWater: ['The air cannot hold any more water.', 'Sweat stops evaporating.'],
    avoidExertion: ['Shirts stick even without the sun.'],
    stopCool: ['Sweat stops evaporating, so you stop cooling down.'],
    indoor: ['Shirts start sticking.', 'Muggy but mild.'],
    sunShade: ['Sunday looks drier.', 'Shadeless streets'],
    loadLevel: ['Shirts stick.', 'Sweat is slow to dry.'],
  };
  for (const [cls, list] of Object.entries(negatives)) {
    for (const text of list) assert.ok(!has(text, cls), `${cls} should not match "${text}"`);
  }
});

test('hydration-only detection allows drinking advice and nothing else', () => {
  assert.equal(isHydrationOnly('Dry heat: keep drinking.'), true);
  assert.equal(isHydrationOnly('Take regular breaks and drink.'), false);
});
