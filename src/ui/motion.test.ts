import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REFUSAL_LIFE_MS, TOAST_LIFE_MS, TOOLTIP_DELAY_MS } from './motion';
import { trackInputModality } from './inputModality';

const tokens = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
const ms = (name: string) => Number(tokens.match(new RegExp(`${name}:(\\d+)ms`))?.[1]);

test('the motion numbers a library needs match their tokens', () => {
  expect(TOOLTIP_DELAY_MS).toBe(ms('--qp-delay-tooltip'));
  expect(TOAST_LIFE_MS).toBe(ms('--qp-life-toast'));
  /* a refusal stays longer than news: it says what to do next (Task 7 review: no magic multiplier) */
  expect(REFUSAL_LIFE_MS).toBe(ms('--qp-life-refusal'));
  expect(REFUSAL_LIFE_MS).toBeGreaterThan(TOAST_LIFE_MS);
});

test('<html> carries the last kind of input: a key press, then a pointer press', () => {
  const root = document.documentElement;
  delete root.dataset.input;
  const stop = trackInputModality();
  expect(root.dataset.input).toBeUndefined();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(root.dataset.input).toBe('keyboard');
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(root.dataset.input).toBe('pointer');
  stop();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(root.dataset.input).toBe('pointer');
  delete root.dataset.input;
});

/* Task 7 review: after typing in a box, moving the mouse to hover a tip is
   pointer input again, so the tip it opens animates as a pointer's does. */
test('<html> goes back to pointer when the pointer moves after typing', () => {
  const root = document.documentElement;
  delete root.dataset.input;
  const stop = trackInputModality();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  expect(root.dataset.input).toBe('keyboard');
  document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
  expect(root.dataset.input).toBe('pointer');
  stop();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
  expect(root.dataset.input).toBe('pointer');
  delete root.dataset.input;
});
