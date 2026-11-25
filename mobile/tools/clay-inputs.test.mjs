// What the clay bench hands the AI: frame times for a video, and a cleaned-up written prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameTimes, cleanPrompt, AI_KINDS, PROMPT_MAX } from '../assets/js/clay-inputs.js';

test('the three ways in are photo, video and words', () => {
  assert.deepEqual(AI_KINDS, ['image', 'video', 'text']);
});

test('frames spread evenly over the clip and skip the very start and end', () => {
  const times = frameTimes(8);
  assert.deepEqual(times, [1, 3, 5, 7]);
  assert.ok(times[0] > 0 && times.at(-1) < 8);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], 'in order');
});

test('2 to 4 frames, whatever is asked for', () => {
  assert.equal(frameTimes(10, 1).length, 2);
  assert.equal(frameTimes(10, 3).length, 3);
  assert.equal(frameTimes(10, 9).length, 4);
});

test('a clip with no usable length gives no frames', () => {
  for (const d of [0, -3, NaN, Infinity, undefined, null]) assert.deepEqual(frameTimes(d), [], String(d));
});

test('very short clips still give distinct times, rounded to hundredths', () => {
  const times = frameTimes(0.3);
  assert.equal(new Set(times).size, times.length);
  for (const t of times) assert.equal(Math.round(t * 100) / 100, t);
});

test('prompts lose control characters and extra spaces', () => {
  assert.equal(cleanPrompt('  一只\n\t橘猫\u0000在   桥上  '), '一只 橘猫 在 桥上');
  assert.equal(cleanPrompt('a\u007fb'), 'a b');
});

test('empty or odd input becomes an empty prompt', () => {
  for (const v of [null, undefined, '', '   \n ']) assert.equal(cleanPrompt(v), '');
  assert.equal(cleanPrompt(42), '42');
});

test('prompts are cut to the server limit', () => {
  assert.equal(PROMPT_MAX, 600);
  assert.equal(cleanPrompt('猫'.repeat(700)).length, 600);
  assert.equal(cleanPrompt('x '.repeat(400)).length <= 600, true);
});
