// The Help page: emergency numbers open the dialer, and no stale "not connected" notice remains.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('help page', () => {
  it('keeps the emergency numbers as tel: links the dialer can open', async () => {
    const page = await read('../assets/js/page-support.js');
    assert.match(page, /href="tel:110"/); assert.match(page, /href="tel:120"/);
    assert.match(page, /window\.Android\?\.openExternal/);
    assert.doesNotMatch(page, /tel:.*target="_blank"/, 'the dialer opens in place');
  });
  it('drops the stale "assistant not connected" notice and its copy', async () => {
    const page = await read('../assets/js/page-support.js');
    assert.doesNotMatch(page, /support\.ai\.off/); assert.doesNotMatch(page, /support\.ask/);
    for (const locale of ['zh', 'en']) {
      const copy = JSON.parse(await read(`../assets/messages/${locale}.json`));
      assert.equal(copy['support.ai.off'], undefined, `${locale} has no stale notice`);
      assert.equal(copy['support.ask'], undefined, `${locale} has no empty ask section`);
      assert.ok(copy['support.dial'], `${locale} still explains the number if the dialer does not open`);
    }
  });
});
