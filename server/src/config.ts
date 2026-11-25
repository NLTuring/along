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
// Photo-to-3D for the clay workshop (PINCH adapter). Keys stay in server .env; result downloads
// are restricted to an exact CDN hostname allowlist because providers return signed URLs.
const meshBases = { meshy: 'https://api.meshy.ai/openapi' } as const;
// Tripo's v3 API; the older api.tripo3d.ai/v2 host is not reachable from mainland China.
const TRIPO_BASE = 'https://openapi.tripo3d.com/v3';
const modelName = z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
function loadMesh(env: NodeJS.ProcessEnv) {
  // openai-layout: an OpenAI-compatible vision model lays the photo out as clay parts (the PINCH method);
  // tripo / meshy: a mesh-generation service returns a GLB.
  const provider = z.enum(['disabled', 'tripo', 'meshy', 'openai-layout']).parse(env.MESH_PROVIDER || 'disabled');
  // Tripo is offered next to the two-AI relay whenever its key is set (MESH_TRIPO_API_KEY; TRIPO_API_KEY is still read).
  const tripoKey = provider === 'disabled' ? '' : env.MESH_TRIPO_API_KEY || env.TRIPO_API_KEY || '';
  const tripo = tripoKey ? {
    apiKey: tripoKey, baseUrl: TRIPO_BASE, model: modelName.parse(env.MESH_TRIPO_MODEL || 'v3.1-20260211'),
    // Signed result links come from Tripo's own CDN only.
    resultHosts: env.MESH_TRIPO_RESULT_HOSTS ? hostList(env.MESH_TRIPO_RESULT_HOSTS) : ['openapi.cdn.tripo3d.com'],
  } : null;
  const layout = provider === 'openai-layout';
  const llmBaseUrl = layout ? endpoint(env.MESH_LLM_BASE_URL) : '';
  const llmHosts = layout ? hostList(env.MESH_LLM_ALLOWED_HOSTS) : [];
  if (llmBaseUrl) {
    const url = new URL(llmBaseUrl);
    if (!/^\/v1\/?$/.test(url.pathname) || url.search) throw new Error('MESH_LLM_BASE_URL must use the /v1 path without a query');
    if (llmHosts.length && !llmHosts.includes(url.hostname)) throw new Error('MESH_LLM_BASE_URL is not in MESH_LLM_ALLOWED_HOSTS');
  }
  const apiKey = provider === 'tripo' ? tripoKey : provider === 'meshy' ? env.MESHY_API_KEY || '' : layout ? env.MESH_LLM_API_KEY || '' : '';
  // Optional second AI that repairs and details the first AI's rough layout (OpenAI-compatible chat).
  // Blank base URL / hosts / key reuse the draft model's gateway settings.
  const refineModel = layout && env.MESH_REFINE_MODEL ? modelName.parse(env.MESH_REFINE_MODEL) : '';
  const refineBaseUrl = refineModel ? endpoint(env.MESH_REFINE_BASE_URL) || llmBaseUrl : '';
  const refineHosts = refineModel ? (env.MESH_REFINE_ALLOWED_HOSTS ? hostList(env.MESH_REFINE_ALLOWED_HOSTS) : llmHosts) : [];
  if (refineBaseUrl) {
    const url = new URL(refineBaseUrl);
    if (!/^\/v1\/?$/.test(url.pathname) || url.search) throw new Error('MESH_REFINE_BASE_URL must use the /v1 path without a query');
    if (!refineHosts.includes(url.hostname)) throw new Error('MESH_REFINE_BASE_URL is not in MESH_REFINE_ALLOWED_HOSTS');
  }
  const refine = refineModel && refineBaseUrl ? {
    model: refineModel, baseUrl: refineBaseUrl, hosts: refineHosts, apiKey: env.MESH_REFINE_API_KEY || env.MESH_LLM_API_KEY || '',
    // Each extra round sends the refined layout back to the refiner with the remaining problems.
    rounds: z.coerce.number().int().min(1).max(3).parse(env.MESH_REFINE_ROUNDS || 2),
  } : null;
  return {
    provider, apiKey, baseUrl: provider === 'tripo' ? TRIPO_BASE : provider === 'meshy' ? meshBases.meshy : llmBaseUrl,
    refine: refine?.apiKey ? refine : null, tripo,
    llmHosts, llmModel: layout && env.MESH_LLM_MODEL ? modelName.parse(env.MESH_LLM_MODEL) : '',
    llmTimeoutMs: z.coerce.number().int().min(10_000).max(300_000).parse(env.MESH_LLM_TIMEOUT_MS || 150_000),
    resultHosts: hostList(env.MESH_RESULT_HOSTS),
    timeoutMs: z.coerce.number().int().min(60_000).max(3_600_000).parse(env.MESH_JOB_TIMEOUT_MS || 900_000),
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
  const mesh = loadMesh(env);
  // Two ways to make the clay model: the two-AI relay (openai-layout) and Tripo; either one switches the feature on.
  const meshLayoutReady = mesh.provider === 'openai-layout' && Boolean(mesh.apiKey && mesh.baseUrl && mesh.llmHosts.length && mesh.llmModel);
  const meshReady = meshLayoutReady || Boolean(mesh.tripo) || (mesh.provider === 'meshy' && Boolean(mesh.apiKey && mesh.resultHosts.length));
  // Local test mode never calls out, except the clay photo-to-3D gateway when explicitly allowed for a demo.
  const localMesh = local && flag(env.DEVELOPMENT_LOCAL_ALLOW_MESH);
  if (local && (smtpReady || aiDetectReady || aiEditReady || assistantReady || (meshReady && !localMesh))) throw new Error('DEVELOPMENT_LOCAL forbids external mail/AI calls');
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
    ai, mesh, meshReady, meshLayoutReady,
    // No payment processor is connected: top-ups are labelled demo purchases and never charge.
    pointsDemoTopup: env.POINTS_DEMO_TOPUP !== 'false',
    ffmpeg: env.FFMPEG_PATH || 'ffmpeg', ffprobe: env.FFPROBE_PATH || 'ffprobe',
    limits: { imageBytes: 12 * 1024 * 1024, videoBytes: 80 * 1024 * 1024, videoSeconds: 60, modelBytes: 32 * 1024 * 1024, pixels: 25_000_000 },
  } as const;
}
export type Config = ReturnType<typeof loadConfig>;
