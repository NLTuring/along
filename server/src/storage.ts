import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, GetBucketAclCommand, GetBucketPolicyCommand } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile, unlink, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';

export interface Storage {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  check?(): Promise<void>;
}
export function objectKey(prefix: 'media' | 'models', extension: string) { return `${prefix}/${randomUUID()}.${extension}`; }
function safeKey(key: string) {
  if (!/^(media|models)\/[0-9a-f-]{36}\.(png|mp4|jpg|bin|glb|stl)$/.test(key)) throw new Error('Invalid object key');
  return key;
}
export class FileStorage implements Storage {
  readonly root: string;
  constructor(directory: string) { this.root = resolve(directory); }
  private path(key: string) {
    const path = resolve(this.root, safeKey(key));
    if (!path.startsWith(this.root + sep)) throw new Error('Storage path outside root');
    return path;
  }
  async check() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(this.root) !== this.root) throw new Error('Private storage must be a real, non-symlink directory');
    if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('Private storage directory must have mode 0700');
  }
  private async checkedPath(key: string, create = false) {
    const path = this.path(key), parent = dirname(path);
    if (create) await mkdir(parent, { recursive: true, mode: 0o700 });
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink() || !(await realpath(parent)).startsWith(this.root + sep)) throw new Error('Private storage parent is invalid');
    return path;
  }
  async put(key: string, bytes: Buffer) {
    const path = await this.checkedPath(key, true);
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  }
  async get(key: string) {
    const path = await this.checkedPath(key), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024 * 1024) throw new Error('Private object is invalid or too large');
    return readFile(path);
  }
  async remove(key: string) {
    try { await unlink(await this.checkedPath(key)); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  }
}
// Unit/integration fixture adapter; never selected by runtime production configuration.
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer) { safeKey(key); if (this.objects.has(key)) throw new Error('Immutable object already exists'); this.objects.set(key, Buffer.from(bytes)); }
  async get(key: string) { const bytes = this.objects.get(safeKey(key)); if (!bytes) throw new Error('Object unavailable'); return bytes; }
  async remove(key: string) { this.objects.delete(safeKey(key)); }
}
export class S3Storage implements Storage {
  private client: S3Client;
  private bucket: string;
  constructor(config: Config['s3']) {
    this.bucket = config.bucket;
    this.client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  }
  async check() {
    // Fail closed if permissions do not allow verifying private ACL/policy. No public URLs are generated.
    const acl = await this.client.send(new GetBucketAclCommand({ Bucket: this.bucket }));
    if (acl.Grants?.some(g => g.Grantee?.URI || (g.Grantee?.ID && g.Grantee.ID !== acl.Owner?.ID))) throw new Error('S3 bucket must have owner-only ACL');
    try {
      const result = await this.client.send(new GetBucketPolicyCommand({ Bucket: this.bucket }));
      const policy = JSON.parse(result.Policy || '{}');
      const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
      for (const s of statements.filter(Boolean)) {
        if (s.Effect === 'Allow' && JSON.stringify(s.Principal).includes('*')) throw new Error('Public S3 bucket policies forbidden');
      }
    } catch (error: any) { if (!['NoSuchBucketPolicy', 'NoSuchPolicy'].includes(error?.name)) throw error; }
  }
  async put(key: string, bytes: Buffer, mime: string) { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: bytes, ContentType: mime, ACL: 'private', IfNoneMatch: '*' })); }
  async get(key: string) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    if (!response.Body) throw new Error('Object unavailable');
    if ((response.ContentLength || 0) > 128 * 1024 * 1024) throw new Error('Object exceeds retrieval limit');
    return Buffer.from(await response.Body.transformToByteArray());
  }
  async remove(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) })); }
}
