// Workshop rules on the phone: the points ledger and bead patterns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPoints, grantMonth, MONTHLY_GRANT, TOPUP_TIERS, tierPoints, PRICES, authorEarning } from '../assets/js/points-core.js';
import { buildPattern, beadCounts, kitQuote, boardsFor, finishedCm, patternRef, validPattern, PALETTE, CELL_ALPHABET, hexRgb, SIZES, MAX_PEGS } from '../assets/js/beads.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

test('the tiers match the offer: ¥30 → 600, ¥60 → 1200 + 100, 50 free a month', () => {
  assert.deepEqual(TOPUP_TIERS.map((t) => [t.yuan, tierPoints(t)]), [[30, 600], [60, 1300]]);
  assert.equal(MONTHLY_GRANT, 50);
  assert.deepEqual(PRICES, { MAGNET: 5, KEYCHAIN: 5, BEADS: 5, AI_MODEL: 20 });
  assert.equal(authorEarning(10), 5);
  assert.equal(authorEarning(1), 0);
});

test('the local ledger grants once a month, credits once per key and never overdraws', () => {
  const storage = memoryStorage();
  let now = new Date('2026-11-24T04:00:00Z');
  const book = createLocalPoints({ storage: () => storage, now: () => now });
  assert.equal(book.state().balance, 50);
  assert.equal(book.state().balance, 50);
  assert.equal(book.topup('T30', 'k1').balance, 650);
  assert.equal(book.topup('T30', 'k1').replay, true);
  assert.equal(book.state().balance, 650);
  for (let i = 0; i < 130; i++) book.spend('MAGNET', `c${i}`, `s${i}`);
  assert.equal(book.state().balance, 0);
  assert.throws(() => book.spend('BEADS', 'b', 'x'), (error) => error.code === 'POINTS_INSUFFICIENT' && error.needed === 5);
  assert.equal(book.state().balance, 0);
  // Shanghai midnight on 1 December is 16:00 UTC on 30 November.
  now = new Date('2026-11-30T16:30:00Z');
  assert.equal(grantMonth(now), '2026-12');
  assert.equal(book.state().balance, 50);
  assert.equal(book.state().ledger[0].reason, 'MONTHLY_GRANT');
  assert.equal(book.refund('AI_MODEL', 'job', 'job', 20).balance, 70);
  assert.equal(book.refund('AI_MODEL', 'job', 'job', 20).balance, 70);
  // A fresh ledger object on the same storage sees the same balance.
  assert.equal(createLocalPoints({ storage: () => storage, now: () => now }).state().balance, 70);
});

function photo(width, height, paint) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a = 255] = paint(x, y); const i = (y * width + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  }
  return rgba;
}

test('a photo becomes a pattern of real bead colours with a matching materials list', () => {
  // Left half red, right half sky blue, a transparent corner.
  // 4 photo pixels per peg; both edges fall on peg boundaries so no peg mixes two colours.
  const rgba = photo(116, 116, (x, y) => (x < 12 && y < 12 ? [0, 0, 0, 0] : x < 60 ? [200, 50, 47] : [127, 196, 212]));
  const pattern = buildPattern(rgba, 116, 116, { cols: 29 });
  assert.ok(validPattern(pattern));
  assert.deepEqual(pattern.palette.map((p) => p.code).sort(), ['H29', 'H5']);
  const counts = beadCounts(pattern);
  assert.equal(counts.reduce((s, c) => s + c.count, 0), 29 * 29 - [...pattern.cells].filter((c) => c === '.').length);
  assert.ok([...pattern.cells].filter((c) => c === '.').length >= 4, 'transparent pixels leave empty pegs');
  assert.equal(boardsFor(pattern), 1);
  assert.deepEqual(finishedCm(pattern), [14.5, 14.5]);
  const quote = kitQuote(pattern, 'FULL_KIT');
  assert.equal(quote.totalCents, 2 * 600 + 800 + 1500 + 800);
  assert.equal(kitQuote(pattern, 'BEADS').totalCents, 2 * 600 + 800);
  assert.equal(patternRef(pattern), patternRef(structuredClone(pattern)));
});

test('colour limits fold rare colours into the ones kept', () => {
  const rgba = photo(96, 96, (x, y) => { const p = PALETTE[(Math.floor(x / 12) + Math.floor(y / 12) * 8) % PALETTE.length]; return hexRgb(p.hex); });
  const full = buildPattern(rgba, 96, 96, { cols: 48, maxColors: 24 });
  const few = buildPattern(rgba, 96, 96, { cols: 48, maxColors: 6 });
  assert.ok(full.palette.length > 6);
  assert.ok(few.palette.length <= 6);
  assert.ok(validPattern(few));
  const dithered = buildPattern(photo(60, 60, (x) => [x * 4, x * 4, x * 4]), 60, 60, { cols: 30, maxColors: 4, dither: true });
  assert.ok(validPattern(dithered));
  assert.ok(new Set(dithered.cells).size > 2);
});

test('pattern validation rejects broken or tampered grids', () => {
  const ok = { width: 8, height: 8, bead: 'MIDI_5MM', palette: [{ code: 'H1', hex: '#f7f5f0' }], cells: '0'.repeat(64) };
  assert.ok(validPattern(ok));
  assert.equal(validPattern({ ...ok, cells: '0'.repeat(63) }), false);
  assert.equal(validPattern({ ...ok, cells: '1'.repeat(64) }), false);
  assert.equal(validPattern({ ...ok, width: 200 }), false);
  assert.equal(validPattern({ ...ok, width: 129, height: 8, cells: '0'.repeat(129 * 8) }), false);
  assert.equal(CELL_ALPHABET.length, 64);
});

test('large boards keep photo detail: 116 pegs and 32 colours', () => {
  assert.deepEqual(SIZES, [29, 58, 87, 116]);
  assert.equal(MAX_PEGS, 128);
  // A 464 × 464 photo with thin stripes: a 29-peg board blurs them, a 116-peg board keeps them.
  const rgba = photo(464, 464, (x) => (Math.floor(x / 8) % 2 ? [245, 240, 230] : [30, 60, 140]));
  const coarse = buildPattern(rgba, 464, 464, { cols: 29 }), fine = buildPattern(rgba, 464, 464, { cols: 116, maxColors: 32 });
  assert.ok(validPattern(fine));
  assert.equal(fine.cells.length, 116 * 116);
  const changes = (p) => { let n = 0; for (let x = 1; x < p.width; x++) if (p.cells[x] !== p.cells[x - 1]) n++; return n; };
  assert.ok(changes(fine) > 40, `fine board shows the stripes (${changes(fine)} edges)`);
  assert.ok(changes(coarse) < changes(fine) / 2);
  assert.equal(boardsFor(fine), 16);
  assert.deepEqual(finishedCm(fine), [58, 58]);
  const many = buildPattern(photo(256, 256, (x, y) => { const p = PALETTE[(Math.floor(x / 16) + Math.floor(y / 16) * 16) % PALETTE.length]; return hexRgb(p.hex); }), 256, 256, { cols: 128, maxColors: 32 });
  assert.ok(many.palette.length > 24 && many.palette.length <= 32, `${many.palette.length} colours`);
});

test('pages that listen on the shared app root remove those listeners when they close', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dir = new URL('../assets/js/', import.meta.url);
  for (const name of (await readdir(dir)).filter((n) => /^page-.*\.js$/.test(n))) {
    const source = await readFile(new URL(name, dir), 'utf8');
    const added = (source.match(/\broot\.addEventListener\(\s*'(\w+)'/g) || []).length;
    const removed = (source.match(/\broot\.removeEventListener\(\s*'(\w+)'/g) || []).length;
    // An inline arrow can never be removed: a stale handler on the shared root fires on every later page.
    assert.doesNotMatch(source, /\broot\.addEventListener\(\s*'\w+',\s*(?:async\s*)?\(/, `${name} adds an anonymous root listener`);
    assert.ok(removed >= added, `${name}: ${added} root listeners added, ${removed} removed`);
  }
});
