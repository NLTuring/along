import { z } from 'zod';
import type { Config } from './config.js';
import { fail, type ImageProvider } from './core.js';
import { allowedProviderUrl, checkedPngResponse, HttpImageProvider, safeHttps, sanitizeProviderImage, type ProviderTransport } from './providers.js';

const jsonLimit = 64 * 1024;
const inputLimit = 10_000_000;
const responseSchema = z.object({
  output: z.object({
    choices: z.array(z.object({
      finish_reason: z.literal('stop'),
      message: z.object({
        role: z.literal('assistant'),
        content: z.array(z.object({ image: z.string().min(1).max(8192).optional(), text: z.string().max(8192).optional() })).min(1).max(8),
      }),
    })).length(1),
  }),
});

/** Native synchronous DashScope multimodal-generation API, not a binary image gateway.
 * https://help.aliyun.com/zh/model-studio/qwen-image-edit-api
 * Segmentation is deliberately a separate, trusted anime-capable gateway. SegmentBody
 * only supports real people and is not a substitute for the ANIME stage.
 */
export class AliyunImageProvider implements ImageProvider {
  private readonly segmentation: HttpImageProvider;
  constructor(private config: Config, private transport: ProviderTransport = safeHttps) {
    this.segmentation = new HttpImageProvider(config, transport);
  }
  async edit(bytes: Buffer) {
    const ai = this.config.ai;
    if (this.config.local || !this.config.aiReady || ai.provider !== 'aliyun-dashscope') fail(503, 'AI_UNAVAILABLE');
    const deadline = Date.now() + ai.timeoutMs;
    const remaining = () => {
      const ms = deadline - Date.now();
      if (ms <= 0) throw new Error('PROVIDER_TIMEOUT');
      return ms;
    };
    const endpoint = allowedProviderUrl(ai.editUrl, ai.editHosts);
    const sanitized = await sanitizeProviderImage(bytes, this.config, inputLimit);
    const body = Buffer.from(JSON.stringify({
      model: ai.model,
      input: { messages: [{ role: 'user', content: [
        { image: `data:image/png;base64,${sanitized.toString('base64')}` },
        { text: ai.prompt },
      ] }] },
      // n=1 is supported by the documented Qwen image-edit family. No async task polling.
      parameters: { n: 1 },
    }), 'utf8');
    const result = await this.transport(endpoint, 'POST', body, {
      Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json',
    }, jsonLimit, remaining());
    if (result.bytes.length > jsonLimit) throw new Error('PROVIDER_RESPONSE_TOO_LARGE');
    if (result.type.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new Error('PROVIDER_FORMAT_INVALID');
    let decoded: unknown;
    try { decoded = JSON.parse(result.bytes.toString('utf8')); } catch { throw new Error('PROVIDER_RESPONSE_INVALID'); }
    // Error messages/URLs from providers may contain sensitive details; do not surface them.
    if (!decoded || typeof decoded !== 'object' || 'code' in decoded || 'error' in decoded) throw new Error('PROVIDER_REJECTED');
    const parsed = responseSchema.safeParse(decoded);
    if (!parsed.success) throw new Error('PROVIDER_RESPONSE_INVALID');
    const images = parsed.data.output.choices[0].message.content.flatMap(part => part.image ? [part.image] : []);
    if (images.length !== 1) throw new Error('PROVIDER_RESPONSE_INVALID');
    const imageUrl = allowedProviderUrl(images[0], ai.resultHosts);
    // Never forward the API key (or any user credentials) to a signed result URL.
    const image = await this.transport(imageUrl, 'GET', undefined, { Accept: 'image/png' }, this.config.limits.imageBytes, Math.min(30000, remaining()));
    return sanitizeProviderImage(checkedPngResponse(image, this.config.limits.imageBytes), this.config);
  }
  segment(bytes: Buffer) { return this.segmentation.segment(bytes); }
}
