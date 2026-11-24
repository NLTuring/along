// Static checks for mobile/assets: both language files agree, every text key
// used in the scripts exists, and every import names a real export.
// Usage: node mobile/tools/check.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../assets/', import.meta.url));
const read = (p) => readFileSync(dir + p, 'utf8');
let problems = 0;
const fail = (msg) => { problems += 1; console.log('  ' + msg); };

// 1. language files
function messages(locale) {
  const merged = {};
  for (const name of [`${locale}.json`, ...['online', 'community', 'craft-online', 'native-map', 'assistant', 'social', 'pay', 'travel', 'workshop'].map((feature) => `${feature}.${locale}.json`)]) {
    const values = JSON.parse(read(`messages/${name}`));
    for (const [key, value] of Object.entries(values)) {
      if (key in merged) fail(`duplicate message key in ${name}: ${key}`);
      if (typeof value !== 'string') fail(`non-text message in ${name}: ${key}`);
      merged[key] = value;
    }
  }
  return merged;
}
const en = messages('en');
const zh = messages('zh');
const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
console.log(`messages: en ${Object.keys(en).length}, zh ${Object.keys(zh).length}`);
for (const k of Object.keys(en)) {
  if (!(k in zh)) fail(`only in en: ${k}`);
  else if (holes(en[k]) !== holes(zh[k])) fail(`placeholder mismatch: ${k}`);
  if (en[k].includes('!')) fail(`exclamation mark in en: ${k}`);
}
for (const k of Object.keys(zh)) if (!(k in en)) fail(`only in zh: ${k}`);

// 1b. copy for travellers who live in China: it may only replace keys that exist, in both languages
const overlay = Object.fromEntries(['en', 'zh'].map((locale) => [locale, JSON.parse(read(`messages/domestic.${locale}.json`))]));
const base = { en, zh };
console.log(`domestic overrides: en ${Object.keys(overlay.en).length}, zh ${Object.keys(overlay.zh).length}`);
for (const locale of ['en', 'zh']) {
  const other = locale === 'en' ? 'zh' : 'en';
  for (const [k, value] of Object.entries(overlay[locale])) {
    if (typeof value !== 'string') fail(`non-text message in domestic.${locale}.json: ${k}`);
    else if (!(k in base[locale])) fail(`domestic.${locale}.json replaces an unknown key: ${k}`);
    else if (holes(value) !== holes(base[locale][k])) fail(`placeholder mismatch in domestic.${locale}.json: ${k}`);
    if (!(k in overlay[other])) fail(`only in domestic.${locale}.json: ${k}`);
    if (locale === 'en' && typeof value === 'string' && value.includes('!')) fail(`exclamation mark in domestic.en.json: ${k}`);
  }
}

// 2. text keys used in scripts
const files = readdirSync(dir + 'js').filter((f) => f.endsWith('.js'));
const source = Object.fromEntries(files.map((f) => [f, read('js/' + f)]));
const all = Object.values(source).join('\n');
const used = new Set([...all.matchAll(/\bte?\(\s*['"]([A-Za-z0-9_.]+)['"]/g)].map((m) => m[1]));
for (const k of used) if (!(k in en)) fail(`key used but not defined: ${k}`);
// Keys built at run time, e.g. t(`status.${x}`): match by prefix.
const prefixes = [...all.matchAll(/\bte?\(\s*`([A-Za-z0-9_.]+)\$\{/g)].map((m) => m[1]);
const unused = Object.keys(en).filter((k) => !used.has(k) && !prefixes.some((p) => k.startsWith(p)));
console.log(`keys defined but never referenced: ${unused.length ? unused.join(', ') : 'none'}`);

// 3. imports
for (const [file, text] of Object.entries(source)) {
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
    const target = m[2];
    if (!existsSync(dir + 'js/' + target)) { fail(`${file}: imports missing file ${target}`); continue; }
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (!name) continue;
      const re = new RegExp('export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+' + name + '\\b');
      const targetSource = source[target] || read('js/' + target);
      const explicit = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
      if (!re.test(targetSource) && !explicit.test(targetSource)) fail(`${file}: ${target} has no export "${name}"`);
    }
  }
}

console.log(problems ? `${problems} problem(s)` : 'no problems');
process.exitCode = problems ? 1 : 0;
