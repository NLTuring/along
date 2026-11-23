import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

const flag = (v: string | undefined) => v === 'true';
const dashScopePath = '/api/v1/services/aigc/multimodal-generation/generation';
const dashScopeHosts = { 'cn-beijing': 'dashscope.aliyuncs.com', 'ap-southeast-1': 'dashscope-intl.aliyuncs.com' } as const;
function hostList(value = '') {
  // Exact DNS hostnames only: no wildcard suffix matching, ports, URLs or IP literals.
  return z.array(z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/)).max(32)
    .parse(value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}
function endpoint(value: string | undefined) {
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('AI endpoint must be a valid HTTPS URL'); }
  if (value.length > 2048 || /[\s\\]/.test(value) || url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) throw new Error('AI endpoint must use HTTPS port 443 without credentials or fragments');
  return url.href;
}
function loadAI(env: NodeJS.ProcessEnv) {
  const provider = z.enum(['disabled', 'aliyun-dashscope', 'http-gateway', 'openai-person']).parse(env.AI_PROVIDER || 'disabled');
  const region = z.enum(['cn-beijing', 'ap-southeast-1']).parse(env.DASHSCOPE_REGION || 'cn-beijing');
  const editUrl = endpoint(provider === 'openai-person' ? undefined : provider === 'aliyun-dashscope' ? env.DASHSCOPE_ENDPOINT || `https://${dashScopeHosts[region]}${dashScopePath}` : env.AI_EDIT_URL);
  const editHosts = hostList(provider === 'aliyun-dashscope' ? env.DASHSCOPE_ENDPOINT_HOSTS || dashScopeHosts[region] : env.AI_EDIT_ALLOWED_HOSTS);
  const segmentUrl = endpoint(env.AI_SEGMENT_URL), segmentHosts = hostList(env.AI_SEGMENT_ALLOWED_HOSTS);
  const resultHosts = hostList(env.DASHSCOPE_RESULT_HOSTS);
  const openaiBaseUrl = endpoint(provider === 'openai-person' ? env.OPENAI_BASE_URL : undefined);
  const openaiHosts = hostList(provider === 'openai-person' ? env.OPENAI_ALLOWED_HOSTS : undefined);
  // Optional separate OpenAI-compatible /images/edits gateway for the anime variant.
  const openaiImageBaseUrl = endpoint(provider === 'openai-person' ? env.OPENAI_IMAGE_BASE_URL : undefined);
  const openaiImageHosts = hostList(provider === 'openai-person' ? env.OPENAI_IMAGE_ALLOWED_HOSTS : undefined);
  for (const base of [openaiBaseUrl, openaiImageBaseUrl]) {
    if (!base) continue;
    const url = new URL(base);
    if (!/^\/v1\/?$/.test(url.pathname) || url.search) throw new Error('OpenAI base URL must use the /v1 path without a query');
  }
  for (const [url, hosts] of [[editUrl, editHosts], [segmentUrl, segmentHosts], [openaiBaseUrl, openaiHosts], [openaiImageBaseUrl, openaiImageHosts]] as const) {
    if (url && hosts.length && !hosts.includes(new URL(url).hostname)) throw new Error('AI endpoint is not in its exact hostname allowlist');
  }
  if (provider === 'aliyun-dashscope') {
    const url = new URL(editUrl);
    const workspaceSuffix = `.${region}.maas.aliyuncs.com`;
    const workspace = url.hostname.endsWith(workspaceSuffix) ? url.hostname.slice(0, -workspaceSuffix.length) : '';
    if ((url.hostname !== dashScopeHosts[region] && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workspace)) || url.pathname !== dashScopePath || url.search) throw new Error('DashScope endpoint must match the official region and multimodal-generation path');
  }
  return {
    provider, editUrl, editHosts, segmentUrl, segmentHosts, resultHosts,
    openaiBaseUrl, openaiHosts,
    openaiModel: provider === 'openai-person' && env.OPENAI_MODEL ? z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/).parse(env.OPENAI_MODEL) : '',
    openaiApiKey: provider === 'openai-person' ? env.OPENAI_API_KEY || '' : '',
    assistantModel: provider === 'openai-person' ? z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/).parse(env.OPENAI_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001') : '',
    assistantTimeoutMs: z.coerce.number().int().min(5000).max(120000).parse(env.AI_ASSISTANT_TIMEOUT_MS || 45000),
    openaiImageBaseUrl, openaiImageHosts,
    openaiImageModel: provider === 'openai-person' && env.OPENAI_IMAGE_MODEL ? z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/).parse(env.OPENAI_IMAGE_MODEL) : '',
    openaiImageApiKey: provider === 'openai-person' ? env.OPENAI_IMAGE_API_KEY || '' : '',
    imageTimeoutMs: z.coerce.number().int().min(10000).max(300000).parse(env.AI_IMAGE_TIMEOUT_MS || 180000),
    apiKey: (provider === 'aliyun-dashscope' ? env.DASHSCOPE_API_KEY : env.AI_API_KEY) || '',
    segmentApiKey: env.AI_SEGMENT_API_KEY || '',
    animeSegmentation: flag(env.AI_SEGMENT_ANIME_CAPABLE), region,
    model: env.DASHSCOPE_MODEL ? z.string().max(96).regex(/^qwen-image-[a-z0-9][a-z0-9.-]*$/).parse(env.DASHSCOPE_MODEL) : '',
    prompt: z.string().trim().min(1).max(2000).parse(env.DASHSCOPE_EDIT_PROMPT || 'Convert the people in this image into a clean 2D anime illustration. Preserve every person, their pose, full silhouette, composition and the original aspect ratio. Do not add people, text, borders or watermarks.'),
    timeoutMs: z.coerce.number().int().min(1000).max(180000).parse(env.AI_REQUEST_TIMEOUT_MS || 120000),
    mask: z.enum(['grayscale-white-foreground', 'alpha-foreground']).parse(env.AI_MASK_REPRESENTATION || 'grayscale-white-foreground'),
  };
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.NODE_ENV === 'production' ? 'production' : 'development';
  const local = flag(env.DEVELOPMENT_LOCAL);
  const origins = (env.APP_ORIGINS || 'http://localhost:4175').split(',').map(s => new URL(s.trim()).origin);
  const publicBasePath = z.string().regex(/^(?:\/[A-Za-z0-9_-]+)*$/).max(128).parse(env.PUBLIC_BASE_PATH || '');
  const secret = env.SESSION_SECRET || '';
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 random characters');
  if (mode === 'production' && (local || flag(env.DEV_OTP_DISPLAY))) throw new Error('Development modes are forbidden in production');
  if (mode === 'production' && origins.some(o => !o.startsWith('https://'))) throw new Error('Production origins must use HTTPS');
  if (!local && (!env.DATABASE_URL || !env.REDIS_URL)) throw new Error('PostgreSQL DATABASE_URL and REDIS_URL required');
  const smtpReady = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
  if (mode === 'production' && !smtpReady) throw new Error('Production SMTP configuration required');
  const storageDriver = z.enum(['s3', 'filesystem']).parse(env.STORAGE_DRIVER || 's3');
  const privateStorageDir = env.PRIVATE_STORAGE_DIR || '';
  if (!local && storageDriver === 'filesystem' && (mode !== 'production' || !privateStorageDir || !isAbsolute(privateStorageDir))) throw new Error('Production filesystem storage requires an explicit absolute PRIVATE_STORAGE_DIR');
  if (!local && storageDriver === 's3' && !(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)) throw new Error('Private S3 storage configuration required');
  if (mode === 'production' && storageDriver === 's3' && !env.S3_ENDPOINT?.startsWith('https://')) throw new Error('Production S3 endpoint must be HTTPS');
  const ai = loadAI(env);
  const aiReady = Boolean(ai.provider !== 'disabled' && ai.provider !== 'openai-person' && ai.editUrl && ai.editHosts.length && ai.apiKey && ai.segmentUrl && ai.segmentHosts.length && ai.segmentApiKey && ai.animeSegmentation && (ai.provider !== 'aliyun-dashscope' || (ai.model && ai.resultHosts.length)));
  const aiDetectReady = ai.provider === 'openai-person' ? Boolean(ai.openaiBaseUrl && ai.openaiHosts.length && ai.openaiModel && ai.openaiApiKey) : aiReady;
  // openai-person: the anime picture needs only the image gateway; localization stays optional and separate.
  const aiEditReady = ai.provider === 'openai-person' ? Boolean(ai.openaiImageBaseUrl && ai.openaiImageHosts.length && ai.openaiImageModel && ai.openaiImageApiKey) : aiReady;
  // The in-app assistant reuses the openai-person chat gateway with its own (smaller, faster) model.
  const assistantReady = ai.provider === 'openai-person' && Boolean(ai.openaiBaseUrl && ai.openaiHosts.length && ai.assistantModel && ai.openaiApiKey);
  if (local && (smtpReady || aiDetectReady || aiEditReady || assistantReady)) throw new Error('DEVELOPMENT_LOCAL forbids external mail/AI calls');
  return {
    mode, local, secret, origins, publicBasePath, host: env.HOST || '127.0.0.1', port: z.coerce.number().int().min(1).max(65535).parse(env.PORT || 3001),
    devOtp: mode === 'development' && flag(env.DEV_OTP_DISPLAY),
    databaseUrl: env.DATABASE_URL || '', redisUrl: env.REDIS_URL || '',
    admins: new Set((env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)),
    baiduKey: env.BAIDU_BROWSER_AK || env.BAIDU_BROWSER_KEY || '', baiduServerKey: env.BAIDU_SERVER_AK || '',
    storageDriver,
    storageDir: !local && storageDriver === 'filesystem' ? privateStorageDir : env.LOCAL_STORAGE_DIR || fileURLToPath(new URL('../.data/private/', import.meta.url)),
    s3: { endpoint: env.S3_ENDPOINT || '', region: env.S3_REGION || 'us-east-1', bucket: env.S3_BUCKET || '', accessKeyId: env.S3_ACCESS_KEY_ID || '', secretAccessKey: env.S3_SECRET_ACCESS_KEY || '', forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false' },
    smtp: { host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 465), secure: env.SMTP_SECURE !== 'false', user: env.SMTP_USER || '', password: env.SMTP_PASSWORD || '', from: env.SMTP_FROM || '' },
    smtpReady, aiReady, aiDetectReady, aiEditReady, assistantReady,
    workerConcurrency: z.coerce.number().int().min(1).max(4).parse(env.WORKER_CONCURRENCY || 2),
    ai,
    ffmpeg: env.FFMPEG_PATH || 'ffmpeg', ffprobe: env.FFPROBE_PATH || 'ffprobe',
    limits: { imageBytes: 12 * 1024 * 1024, videoBytes: 80 * 1024 * 1024, videoSeconds: 60, modelBytes: 32 * 1024 * 1024, pixels: 25_000_000 },
  } as const;
}
export type Config = ReturnType<typeof loadConfig>;
