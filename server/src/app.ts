import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import { ZodError } from 'zod';
import { ApiError, type Services } from './core.js';
import { authHooks, authRoutes } from './auth.js';
import { createMobileAuthHooks } from './mobile-auth.js';
import { communityRoutes } from './community.js';
import { mediaRoutes } from './media.js';
import { craftRoutes } from './jobs.js';
import { modelRoutes } from './models.js';
import { inquiryRoutes } from './inquiries.js';
import { mapRoutes, type ProviderTransport } from './providers.js';
import { assistantRoutes } from './assistant.js';
import { profileRoutes } from './profiles.js';
import { pointRoutes } from './points.js';
import { beadRoutes } from './beads.js';
import { galleryRoutes } from './gallery.js';
import { aiModelRoutes, createMeshProviders, meshEngines, type MeshEngines, type MeshProvider } from './ai-models.js';

// The assistant transport and the 3D providers are injectable so tests never reach a real model gateway.
// meshProvider: one provider, placed by its name (tripo → Tripo, anything else → the two-AI relay).
export async function createApp(s: Services, options: { assistantTransport?: ProviderTransport; meshProvider?: MeshProvider | null; meshEngines?: MeshEngines } = {}) {
  // Disable automatic request/error logging: URLs, cookies, headers and bodies can contain PII/secrets.
  // Operators may record aggregate status metrics at the reverse proxy, not request bodies/query strings.
  const app = Fastify({ logger: false, disableRequestLogging: true, trustProxy: false, bodyLimit: 128 * 1024, requestTimeout: 180000, connectionTimeout: 10000, maxParamLength: 128 });
  await app.register(cookie);
  await app.register(helmet, { global: true, crossOriginResourcePolicy: { policy: 'same-origin' } });
  await app.register(multipart, { limits: { fileSize: s.config.limits.videoBytes, files: 2, fields: 3, fieldSize: 48 * 1024, parts: 5 } });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ApiError) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Request fields are invalid' } });
    const typed = error as { statusCode?: number; code?: string };
    if (typed.code === '23505') return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Resource conflict' } });
    if (typed.statusCode && typed.statusCode >= 400 && typed.statusCode < 500) return reply.code(typed.statusCode).send({ error: { code: typed.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', message: 'Invalid request' } });
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be completed' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
  createMobileAuthHooks(app, s);
  authHooks(app, s);
  app.get('/api/config', async () => ({ mode: s.config.mode, authAvailable: s.config.devOtp || s.config.smtpReady, baidu: { browserKey: s.config.baiduKey, convertAvailable: Boolean(s.config.baiduServerKey && !s.config.local) }, ai: { available: s.config.aiReady, detectAvailable: s.config.aiDetectReady, editAvailable: s.config.aiEditReady, assistantAvailable: s.config.assistantReady, provider: s.config.ai.provider, meshAvailable: s.config.meshReady }, workshop: { demoTopup: s.config.pointsDemoTopup }, limits: { imageBytes: s.config.limits.imageBytes, videoBytes: s.config.limits.videoBytes, videoSeconds: s.config.limits.videoSeconds } }));
  app.get('/api/health', async (_req, reply) => {
    try { await s.db.query('SELECT 1'); return { ok: true }; } catch { return reply.code(503).send({ error: { code: 'UNAVAILABLE', message: 'Database unavailable' } }); }
  });
  authRoutes(app, s); mediaRoutes(app, s); communityRoutes(app, s); profileRoutes(app, s); craftRoutes(app, s); modelRoutes(app, s); inquiryRoutes(app, s); mapRoutes(app, s);
  assistantRoutes(app, s, options.assistantTransport);
  pointRoutes(app, s); beadRoutes(app, s); galleryRoutes(app, s);
  aiModelRoutes(app, s, options.meshEngines ?? (options.meshProvider !== undefined ? meshEngines(options.meshProvider) : createMeshProviders(s.config)));
  await app.ready();
  return app;
}
