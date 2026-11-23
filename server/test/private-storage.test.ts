import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { chmod, mkdtemp, readFile, rm, symlink, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorage, objectKey } from '../src/storage.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'along-private-storage-'));
  roots.push(root);
  const store = new FileStorage(join(root, 'private'));
  await store.check();
  return { root, store };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('private durable filesystem adapter', () => {
  it('writes immutable private objects and reads exact bytes', async () => {
    const { store } = await fixture();
    const key = objectKey('media', 'png');
    await store.put(key, Buffer.from('synthetic'));
    assert.deepEqual(await store.get(key), Buffer.from('synthetic'));
    await assert.rejects(store.put(key, Buffer.from('overwrite')));
    assert.deepEqual(await store.get(key), Buffer.from('synthetic'));
    await store.remove(key);
    await assert.rejects(store.get(key));
    await store.remove(key);
  });
  it('rejects traversal, arbitrary file extensions and malformed object names', async () => {
    const { store } = await fixture();
    for (const key of ['../../etc/passwd', 'media/../../../secret', 'models/a.js', '/media/file.png', 'media/123.png', 'models/' + 'a'.repeat(36) + '.svg']) {
      await assert.rejects(store.put(key, Buffer.from('x')));
      await assert.rejects(store.get(key));
    }
  });
  it('rejects a symlinked storage root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'along-storage-link-')); roots.push(root);
    const target = join(root, 'target'), alias = join(root, 'alias');
    await mkdir(target, { mode: 0o700 });
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new FileStorage(alias).check());
  });
  it('rejects a symlinked object directory before reading or writing', async () => {
    const { store, root } = await fixture();
    const outside = join(root, 'outside'); await mkdir(outside, { mode: 0o700 });
    await symlink(outside, join(store.root, 'media'), process.platform === 'win32' ? 'junction' : 'dir');
    const key = objectKey('media', 'png');
    await assert.rejects(store.put(key, Buffer.from('secret')));
    await assert.rejects(store.get(key));
  });
  it('keeps data available after a new adapter instance is created', async () => {
    const { store } = await fixture(); const key = objectKey('models', 'glb');
    await store.put(key, Buffer.from('synthetic model'));
    const reopened = new FileStorage(store.root); await reopened.check();
    assert.deepEqual(await reopened.get(key), Buffer.from('synthetic model'));
  });
  it('does not permit world/group-readable root on Unix', { skip: process.platform === 'win32' }, async () => {
    const { store } = await fixture();
    await chmod(store.root, 0o755);
    await assert.rejects(store.check());
    await chmod(store.root, 0o700);
  });
});
