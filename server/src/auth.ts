import { randomBytes, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { App, Services, User, Mailer } from './core.js';
import { digest, equal, fail, id, rateLimit, requireUser } from './core.js';
import type { Config } from './config.js';
import { isNativeClient, MOBILE_SESSION_TTL_MS, MOBILE_SESSION_RENEW_AFTER_MS, NATIVE_APP_ORIGIN } from './mobile-auth.js';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const cookieName = (config: Config) => config.mode === 'production' ? (config.publicBasePath ? '__Secure-along_session' : '__Host-along_session') : 'along_session';
export const cookiePath = (config: Config) => `${config.publicBasePath || ''}/`;
export function createMailer(config: Config): Mailer {
  const transport = config.smtpReady ? nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, requireTLS: true, auth: { user: config.smtp.user, pass: config.smtp.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, logger: false, debug: false }) : null;
  return { async sendOtp(email, code) {
    if (config.devOtp) return;
    if (!transport) return fail(503, 'MAIL_UNAVAILABLE');
    await transport.sendMail({ from: config.smtp.from, to: email, subject: 'Along sign-in verification code', text: `Your Along code is ${code}. It expires in 10 minutes. Never share this code.`, disableFileAccess: true, disableUrlAccess: true });
  } };
}
export function authHooks(app: App, s: Services) {
  app.decorateRequest('user', null); app.decorateRequest('sessionHash', null); app.decorateRequest('csrf', null);
  app.decorateRequest('authKind', null); app.decorateRequest('sessionExpiresAt', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (write && (!req.headers.origin || !s.config.origins.includes(req.headers.origin))) fail(403, 'ORIGIN_FORBIDDEN');
    const native = isNativeClient(req, s);
    const authorization = req.headers.authorization;
    if (authorization && (!native || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))) fail(401, 'UNAUTHENTICATED');
    const token = native ? authorization?.slice(7) : req.cookies[cookieName(s.config)];
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      const hash = digest(s.config.secret, token);
      const row = await s.db.one('SELECT s.*,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND s.client_kind=$3', [hash, Date.now(), native ? 'mobile' : 'web']);
      if (row && (!native || row.native_origin === NATIVE_APP_ORIGIN)) {
        req.user = { id: row.user_id, email: row.email, displayName: row.display_name, role: s.config.admins.has(row.email) ? 'ADMIN' : 'USER' };
        req.sessionHash = hash; req.csrf = row.csrf_token;
        req.authKind = native ? 'mobile' : 'web'; req.sessionExpiresAt = Number(row.expires_at);
        // Sliding expiry for phone sessions: renew once a day while the app is in use.
        if (native) {
          const renewed = Date.now() + MOBILE_SESSION_TTL_MS;
          if (renewed - req.sessionExpiresAt >= MOBILE_SESSION_RENEW_AFTER_MS) {
            await s.db.query("UPDATE sessions SET expires_at=$2 WHERE token_hash=$1 AND client_kind='mobile'", [hash, renewed]);
            req.sessionExpiresAt = renewed;
          }
        }
      }
    }
    if (write && req.user && req.authKind === 'web' && (typeof req.headers['x-csrf-token'] !== 'string' || !equal(req.headers['x-csrf-token'], req.csrf!))) fail(403, 'CSRF_INVALID');
    if (write) await rateLimit(s, `writes:${req.ip}`, 180, 60_000);
  });
}
export function authRoutes(app: App, s: Services) {
  app.post('/api/auth/otp', async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).strict().parse(req.body);
    await rateLimit(s, `otp-ip:${req.ip}`, 10, 15 * 60_000);
    const now = Date.now(), expires = now + 10 * 60_000, code = String(randomInt(100000, 1000000));
    const hash = digest(s.config.secret, email), codeHash = digest(s.config.secret, `${email}:${code}`);
    const result = await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM otp_challenges WHERE email_hash=$1 FOR UPDATE', [hash])).rows[0];
      if (row && Number(row.locked_until) > now) return { error: 'LOCKED', until: Number(row.locked_until) };
      if (row && Number(row.sent_at) + 60_000 > now) return { error: 'RATE_LIMITED', until: Number(row.sent_at) + 60_000 };
      await c.query(`INSERT INTO otp_challenges(email_hash,code_hash,expires_at,sent_at,tries,locked_until) VALUES($1,$2,$3,$4,0,0)
        ON CONFLICT(email_hash) DO UPDATE SET code_hash=$2,expires_at=$3,sent_at=$4,tries=0,locked_until=0`, [hash, codeHash, expires, now]);
      return null;
    });
    if (result) return reply.code(429).send({ ok: false, ...result });
    try { await s.mailer.sendOtp(email, code); }
    catch {
      await s.db.query('DELETE FROM otp_challenges WHERE email_hash=$1 AND code_hash=$2', [hash, codeHash]);
      return reply.code(503).send({ ok: false, error: 'MAIL_UNAVAILABLE' });
    }
    return { ok: true, expiresAt: expires, ...(s.config.devOtp ? { code } : {}) };
  });
  app.post('/api/auth/verify', async (req, reply) => {
    const { email, code } = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    await rateLimit(s, `verify-ip:${req.ip}`, 40, 15 * 60_000);
    const hash = digest(s.config.secret, email), now = Date.now();
    const native = isNativeClient(req, s);
    const expiresAt = now + (native ? MOBILE_SESSION_TTL_MS : 7 * 86400000);
    const token = randomBytes(32).toString('base64url'), csrfToken = randomBytes(32).toString('base64url');
    const result = await s.db.tx(async c => {
      const row = (await c.query('SELECT * FROM otp_challenges WHERE email_hash=$1 FOR UPDATE', [hash])).rows[0];
      if (row && Number(row.locked_until) > now) return { ok: false as const, error: 'LOCKED', until: Number(row.locked_until) };
      if (!row || Number(row.expires_at) <= now) return { ok: false as const, error: 'EXPIRED' };
      if (!equal(row.code_hash, digest(s.config.secret, `${email}:${code}`))) {
        const tries = row.tries + 1, until = tries >= 5 ? now + 15 * 60_000 : 0;
        await c.query('UPDATE otp_challenges SET tries=$2,locked_until=$3 WHERE email_hash=$1', [hash, tries, until]);
        return { ok: false as const, error: tries >= 5 ? 'LOCKED' : 'WRONG', triesLeft: Math.max(0, 5 - tries), ...(until ? { until } : {}) };
      }
      await c.query('DELETE FROM otp_challenges WHERE email_hash=$1', [hash]);
      const uid = id();
      await c.query('INSERT INTO users(id,email,display_name) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING', [uid, email, `Traveler-${uid.slice(0, 6)}`]);
      const userRow = (await c.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
      const user: User = { id: userRow.id, email: userRow.email, displayName: userRow.display_name, role: s.config.admins.has(email) ? 'ADMIN' : 'USER' };
      if (req.sessionHash) await c.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
      await c.query('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,client_kind,native_origin) VALUES($1,$2,$3,$4,$5,$6)', [digest(s.config.secret, token), user.id, csrfToken, expiresAt, native ? 'mobile' : 'web', native ? NATIVE_APP_ORIGIN : null]);
      return { ok: true as const, user, csrfToken };
    });
    if (!result.ok) return reply.code(result.error === 'LOCKED' ? 429 : 400).send(result);
    if (native) return { ok: true, user: result.user, mobileToken: token, expiresAt };
    reply.setCookie(cookieName(s.config), token, { httpOnly: true, secure: s.config.mode === 'production', sameSite: 'strict', path: cookiePath(s.config), maxAge: 7 * 86400 });
    return result;
  });
  // Phone clients also learn the (possibly renewed) deadline so they can keep their copy in step.
  app.get('/api/auth/session', async req => ({ user: req.user, ...(req.user ? { csrfToken: req.csrf } : {}), ...(req.user && req.authKind === 'mobile' ? { expiresAt: req.sessionExpiresAt } : {}) }));
  app.post('/api/auth/logout', async (req, reply) => {
    requireUser(req); await s.db.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
    reply.clearCookie(cookieName(s.config), { path: cookiePath(s.config), secure: s.config.mode === 'production', sameSite: 'strict', httpOnly: true });
    return { ok: true };
  });
}
