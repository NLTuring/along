import dns from 'node:dns/promises';
import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import { z } from 'zod';
import type { App, ImageProvider, Services } from './core.js';
import { fail, rateLimit } from './core.js';
import type { Config } from './config.js';

function checkHttps(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash) fail(503, 'PROVIDER_CONFIGURATION_INVALID');
}
export function allowedProviderUrl(value: string, hosts: readonly string[]) {
  if (value.length > 8192 || /[\s\\]/.test(value)) throw new Error('PROVIDER_URL_INVALID');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('PROVIDER_URL_INVALID'); }
  checkHttps(url);
  if (!hosts.includes(url.hostname)) throw new Error('PROVIDER_HOST_FORBIDDEN');
  return url;
}
export type ProviderResponse = { bytes: Buffer; type: string };
export type ProviderTransport = typeof safeHttps;
// Resolve and pin only public addresses. The deadline includes DNS, TLS and body reads.
// Never follow redirects; never decompress an unbounded encoded response.
export async function safeHttps(url: URL, method: 'POST' | 'GET', body: Buffer | undefined, headers: Record<string, string>, maxBytes: number, timeout = 60000): Promise<ProviderResponse> {
  checkHttps(url);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeout) || timeout < 1) throw new Error('PROVIDER_LIMIT_INVALID');
  return new Promise((resolve, reject) => {
    let req: ClientRequest | undefined, response: IncomingMessage | undefined, settled = false;
    const finish = (error?: Error, result?: ProviderResponse) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { response?.destroy(); req?.destroy(); reject(error); }
      else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error('PROVIDER_TIMEOUT')), timeout);
    void (async () => {
      try {
        const addresses = await dns.lookup(url.hostname, { all: true });
        if (settled) return;
        if (!addresses.length || addresses.some(a => ipaddr.process(a.address).range() !== 'unicast')) throw new Error('PROVIDER_ADDRESS_FORBIDDEN');
        const pinned = addresses[0];
        req = https.request(url, { method, headers: { ...headers, 'Accept-Encoding': 'identity', ...(body ? { 'Content-Length': String(body.length) } : {}) }, servername: url.hostname,
          lookup: (_hostname, options, cb) => { if (typeof options === 'object' && options.all) (cb as any)(null, [pinned]); else (cb as any)(null, pinned.address, pinned.family); },
        }, res => {
          response = res;
          if (settled) { res.destroy(); return; }
          if (res.statusCode !== 200) { finish(new Error('PROVIDER_REJECTED')); return; }
          const length = res.headers['content-length'];
          if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maxBytes)) { finish(new Error('PROVIDER_RESPONSE_TOO_LARGE')); return; }
          if (res.headers['content-encoding'] && res.headers['content-encoding'].toLowerCase() !== 'identity') { finish(new Error('PROVIDER_ENCODING_INVALID')); return; }
          let size = 0; const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            if (settled) return;
            size += chunk.length;
            if (size > maxBytes) finish(new Error('PROVIDER_RESPONSE_TOO_LARGE')); else chunks.push(chunk);
          });
          res.on('end', () => {
            if (length !== undefined && size !== Number(length)) finish(new Error('PROVIDER_RESPONSE_INCOMPLETE'));
            else finish(undefined, { bytes: Buffer.concat(chunks), type: String(res.headers['content-type'] || '') });
          });
          res.on('aborted', () => finish(new Error('PROVIDER_RESPONSE_INCOMPLETE')));
          res.on('error', () => finish(new Error('PROVIDER_RESPONSE_FAILED')));
          res.on('close', () => { if (!res.complete) finish(new Error('PROVIDER_RESPONSE_INCOMPLETE')); });
        });
        req.on('error', () => finish(new Error('PROVIDER_REQUEST_FAILED')));
        req.end(body);
      } catch { finish(new Error('PROVIDER_ADDRESS_OR_REQUEST_FAILED')); }
    })();
  });
}
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function checkedPngResponse(result: ProviderResponse, maxBytes: number) {
  if (result.bytes.length > maxBytes) throw new Error('PROVIDER_RESPONSE_TOO_LARGE');
  if (result.type.split(';', 1)[0].trim().toLowerCase() !== 'image/png' || !result.bytes.subarray(0, 8).equals(pngSignature)) throw new Error('PROVIDER_FORMAT_INVALID');
  return result.bytes;
}
/** Decode, orient and re-encode: strip EXIF/ancillary data, no URLs or original upload bytes leave the server. */
export async function sanitizeProviderImage(bytes: Buffer, config: Config, maxBytes = config.limits.imageBytes) {
  if (!bytes.length || bytes.length > config.limits.imageBytes) throw new Error('PROVIDER_INPUT_TOO_LARGE');
  const image = sharp(bytes, { limitInputPixels: config.limits.pixels, failOn: 'warning' });
  const meta = await image.metadata();
  if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || !meta.width || !meta.height || meta.width < 2 || meta.height < 2 || (meta.pages || 1) !== 1) throw new Error('PROVIDER_INPUT_INVALID');
  const sanitized = await image.rotate().toColorspace('srgb').png().toBuffer();
  if (sanitized.length > maxBytes) throw new Error('PROVIDER_INPUT_TOO_LARGE');
  return sanitized;
}
/** Explicit trusted gateway protocol, NOT an official Aliyun API.
 * POST sanitized PNG with a gateway-specific Bearer key; return PNG bytes, never URLs.
 * The segment gateway must support REAL and ANIME, same dimensions, white=foreground or alpha.
 */
export class HttpImageProvider implements ImageProvider {
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {}
  private async call(endpoint: string, hosts: readonly string[], key: string, bytes: Buffer) {
    if (!this.config.aiReady || !endpoint || !key || this.config.local) fail(503, 'AI_UNAVAILABLE');
    const url = allowedProviderUrl(endpoint, hosts);
    const sanitized = await sanitizeProviderImage(bytes, this.config);
    const result = await this.transport(url, 'POST', sanitized, { Authorization: `Bearer ${key}`, 'Content-Type': 'image/png', Accept: 'image/png' }, this.config.limits.imageBytes, this.config.ai.timeoutMs);
    return checkedPngResponse(result, this.config.limits.imageBytes);
  }
  edit(bytes: Buffer) {
    if (this.config.ai.provider !== 'http-gateway') fail(503, 'AI_UNAVAILABLE');
    return this.call(this.config.ai.editUrl, this.config.ai.editHosts, this.config.ai.apiKey, bytes);
  }
  segment(bytes: Buffer) {
    return this.call(this.config.ai.segmentUrl, this.config.ai.segmentHosts, this.config.ai.segmentApiKey, bytes);
  }
}
export async function normalizeMask(bytes: Buffer, width: number, height: number, config: Config) {
  if (bytes.length > config.limits.imageBytes || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('MASK_FORMAT_INVALID');
  const image = sharp(bytes, { limitInputPixels: config.limits.pixels, failOn: 'warning' });
  const meta = await image.metadata();
  if (meta.width !== width || meta.height !== height || (meta.pages || 1) !== 1) throw new Error('MASK_ALIGNMENT_INVALID');
  let raw: Buffer;
  if (config.ai.mask === 'alpha-foreground') {
    if (!meta.hasAlpha) throw new Error('MASK_ALPHA_MISSING');
    raw = await image.extractChannel('alpha').raw().toBuffer();
  } else {
    const { data, info } = await image.removeAlpha().toColorspace('srgb').raw().toBuffer({ resolveWithObject: true });
    // Reject colored person cut-outs; do not guess whether color/luminance is a mask.
    if (info.channels !== 3) throw new Error('MASK_CHANNELS_INVALID');
    raw = Buffer.alloc(width * height);
    for (let i = 0; i < raw.length; i++) {
      if (data[i * 3] !== data[i * 3 + 1] || data[i * 3] !== data[i * 3 + 2]) throw new Error('MASK_NOT_GRAYSCALE');
      raw[i] = data[i * 3];
    }
  }
  let min = 255, max = 0;
  for (const value of raw) { min = Math.min(min, value); max = Math.max(max, value); }
  if (max < 128 || min > 127) throw new Error('MASK_HAS_NO_FOREGROUND_OR_BACKGROUND');
  return sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
}
export function mapRoutes(app: App, s: Services) {
  app.post('/api/maps/convert', async req => {
    await rateLimit(s, `maps:${req.ip}`, 30, 60_000);
    const data = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), from: z.enum(['WGS84', 'GCJ02']) }).strict().parse(req.body);
    if (!s.config.baiduServerKey || s.config.local) fail(503, 'CONFIG_REQUIRED');
    const url = new URL('https://api.map.baidu.com/geoconv/v1/');
    url.search = new URLSearchParams({ coords: `${data.lng},${data.lat}`, from: data.from === 'WGS84' ? '1' : '3', to: '5', ak: s.config.baiduServerKey }).toString();
    try {
      const result = await safeHttps(url, 'GET', undefined, { Accept: 'application/json' }, 32 * 1024, 10000);
      const parsed = z.object({ status: z.literal(0), result: z.array(z.object({ x: z.number().min(-180).max(180), y: z.number().min(-90).max(90) })).length(1) }).parse(JSON.parse(result.bytes.toString('utf8')));
      return { lng: parsed.result[0].x, lat: parsed.result[0].y, crs: 'BD09' };
    } catch { fail(502, 'MAP_PROVIDER_UNAVAILABLE'); }
  });
}
