// One explicitly authorized delivery test. Never prints SMTP credentials or message body.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const nodemailer = require('nodemailer');
const configPath = new URL('../.android-local/smtp-deployment.env', import.meta.url);
const ledgerPath = new URL('../.android-local/smtp-test-ledger.json', import.meta.url);
const env = Object.fromEntries((await readFile(configPath, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#') && s.includes('=')).map(s => { const at = s.indexOf('='); return [s.slice(0, at).trim(), s.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]; }));
const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'].filter(k => !env[k]);
if (missing.length) { console.log(JSON.stringify({ ready: false, missing })); process.exit(2); }
if (!/^\S+@[^\s@]+\.[^\s@]+$/.test(env.SMTP_FROM) || env.SMTP_USER.toLowerCase() !== env.SMTP_FROM.toLowerCase()) throw Error('The authorized self-test requires FROM and USER to be the same mailbox');
const port = Number(env.SMTP_PORT || 465), secure = env.SMTP_SECURE !== 'false';
if (![465, 587].includes(port) || (port === 465 && !secure) || (port === 587 && secure)) throw Error('Use port 465 with TLS or 587 with mandatory STARTTLS');
const mask = address => address.replace(/^(.{2}).*(@.*)$/, '$1***$2');
const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure, requireTLS: true,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, tls: { rejectUnauthorized: true },
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
});
const report = { mailbox: mask(env.SMTP_FROM), authenticated: false, sendAttempted: false, accepted: false, inboxConfirmed: false };
try {
  await transport.verify(); report.authenticated = true;
  // Exclusive ledger creation means a successful or uncertain send is never silently repeated.
  await writeFile(ledgerPath, JSON.stringify({ attemptedAt: new Date().toISOString(), mailbox: report.mailbox, limit: 1 }, null, 2), { flag: 'wx', mode: 0o600 });
  report.sendAttempted = true;
  const sent = await transport.sendMail({ from: env.SMTP_FROM, to: env.SMTP_FROM,
    subject: 'Along 邮件配置测试（仅此一封）',
    text: '这是你授权的 Along 发件服务配置测试邮件。\n此邮件不是登录验证码，无需点击链接或回复密码。\n邮件由配置的发件邮箱发送给自身，用于检查 SMTP 投递。\n如果你能看到这封邮件，说明该邮箱已收到测试邮件。',
    disableFileAccess: true, disableUrlAccess: true,
  });
  report.accepted = sent.accepted?.some(value => String(value).toLowerCase() === env.SMTP_FROM.toLowerCase()) === true;
} catch (error) {
  report.error = error.code === 'EEXIST' ? 'TEST_ALREADY_ATTEMPTED_NO_RESEND' : error.code || error.name;
  report.responseCode = error.responseCode || null;
  process.exitCode = 1;
} finally { transport.close(); }
await writeFile(new URL('../_build/smtp-verification.json', import.meta.url), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
