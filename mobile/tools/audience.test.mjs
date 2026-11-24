// Travellers who live in China: the traveller type, yuan prices, the Chinese seed content and
// the copy that replaces the visitor-from-abroad wording. In-memory storage; no browser or network.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { AUDIENCES, createAudience, getAudience, mainlandChinese, prefersChinese, setAudience } from '../assets/js/audience.js';
import { cny, FX_CNY_PER_USD, money, usd } from '../assets/js/format.js';
import { buildPlan, validatePlan } from '../assets/js/plan.js';
import { amountFor, SERVICE_FEE_CENTS } from '../assets/js/bookings.js';
import { FILM_STYLES, PLAN_TEMPLATE, POIS } from '../assets/js/seed-places.js';
import { GUIDES } from '../assets/js/seed.js';
import { CAPTIONS_ZH, GUIDE_ZH, PLACE_ZH, PLAN_ZH } from '../assets/js/seed-zh.js';
import { parseCommand } from '../assets/js/assistant-commands.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));
const FEATURES = ['online', 'community', 'craft-online', 'native-map', 'assistant', 'social', 'pay', 'travel'];
const ARRIVAL = { date: '2026-12-20', time: '18:00', city: 'shanghai', days: 3 };

function memory() {
  const data = new Map();
  return { fail: false, data,
    getItem(key) { if (this.fail) throw new Error('Injected storage failure'); return data.get(String(key)) ?? null; },
    setItem(key, value) { if (this.fail) throw new Error('Injected storage failure'); data.set(String(key), String(value)); } };
}

describe('traveller type', () => {
  it('reads a mainland phone as a domestic traveller and any Chinese as a Chinese interface', () => {
    for (const tag of ['zh', 'zh-CN', 'zh_CN', 'zh-Hans', 'zh-Hans-CN']) assert.equal(mainlandChinese(tag), true, tag);
    for (const tag of ['zh-TW', 'zh-HK', 'zh-Hant-TW', 'zh-SG', 'en-US', 'ja', 'zhx', '']) assert.equal(mainlandChinese(tag), false, tag);
    for (const tag of ['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK']) assert.equal(prefersChinese(tag), true, tag);
    for (const tag of ['en', 'en-CN', 'zhx', '']) assert.equal(prefersChinese(tag), false, tag);
  });
  it('follows the phone on the first launch and the saved choice after that', () => {
    assert.deepEqual(AUDIENCES, ['domestic', 'inbound']);
    assert.equal(createAudience({ storage: memory, domestic: () => true }).get(), 'domestic');
    assert.equal(createAudience({ storage: memory, domestic: () => false }).get(), 'inbound');
    const storage = memory();
    storage.setItem('along.audience', 'inbound');
    assert.equal(createAudience({ storage: () => storage, domestic: () => true }).get(), 'inbound');
    storage.setItem('along.audience', 'ADMIN');
    assert.equal(createAudience({ storage: () => storage, domestic: () => true }).get(), 'domestic', 'an unknown saved value is ignored');
  });
  it('saves a change, tells listeners once and ignores anything else', () => {
    const storage = memory(), audience = createAudience({ storage: () => storage, domestic: () => false }), seen = [];
    const stop = audience.onChange((value) => seen.push(value));
    audience.set('inbound'); audience.set('tourist'); audience.set(undefined);
    assert.deepEqual(seen, []); assert.equal(storage.getItem('along.audience'), null);
    audience.set('domestic');
    assert.deepEqual(seen, ['domestic']); assert.equal(audience.isDomestic(), true);
    assert.equal(storage.getItem('along.audience'), 'domestic');
    assert.equal(createAudience({ storage: () => storage, domestic: () => false }).get(), 'domestic');
    stop(); audience.set('inbound');
    assert.deepEqual(seen, ['domestic']);
  });
  it('still works for the session when storage cannot be read or written', () => {
    const storage = memory(); storage.fail = true;
    const audience = createAudience({ storage: () => storage, domestic: () => true });
    assert.equal(audience.get(), 'domestic');
    audience.set('inbound');
    assert.equal(audience.get(), 'inbound');
  });
});

describe('prices and budget', () => {
  it('shows yuan to a domestic traveller and US dollars to a visitor', () => {
    setAudience('inbound'); setAudience('domestic');
    assert.equal(getAudience(), 'domestic');
    for (const cents of [0, 400, 990, 4900, 5500]) { assert.equal(money(cents), cny(cents)); assert.match(money(cents), /^¥[\d,]+$/); }
    assert.equal(money(4900), '¥350'); assert.equal(money(400), '¥29');
    setAudience('inbound');
    for (const cents of [0, 400, 990, 4900, 5500]) assert.equal(money(cents), usd(cents));
    assert.equal(money(4900), '$49'); assert.equal(money(990), '$9.90');
  });
  it('adds up on a yuan ticket: guide fee plus service fee is the total, for every guide', () => {
    const yuan = (cents) => Number(cny(cents).replace(/[¥,]/g, ''));
    for (const guide of GUIDES) assert.equal(yuan(guide.priceHalfCents) + yuan(SERVICE_FEE_CENTS), yuan(amountFor(guide)), guide.id);
  });
  it('keeps a yuan budget as integer USD cents like every other amount', () => {
    assert.equal(buildPlan(ARRIVAL, { budget: '500' }).budgetCents, 50_000, 'US dollars stay the default');
    assert.equal(buildPlan(ARRIVAL, { budget: '500', budgetCurrency: 'USD' }).budgetCents, 50_000);
    for (const budget of ['0', '1', '500', '99999']) {
      const plan = buildPlan(ARRIVAL, { budget, budgetCurrency: 'CNY' });
      assert.equal(plan.budgetCents, Math.round((Number(budget) * 100) / FX_CNY_PER_USD), budget);
      assert.ok(Number.isSafeInteger(plan.budgetCents)); assert.deepEqual(validatePlan(plan), [], budget);
    }
    for (const budget of ['', '-1', '12.5', '100000', null, undefined]) assert.equal(buildPlan(ARRIVAL, { budget, budgetCurrency: 'CNY' }).budgetCents, null);
  });
});

describe('Chinese seed content', () => {
  it('describes every place', () => {
    assert.deepEqual(Object.keys(PLACE_ZH).sort(), Object.keys(POIS).sort());
    for (const [id, place] of Object.entries(PLACE_ZH)) { assert.ok(place.description.trim(), id); assert.match(place.description, /[\u4e00-\u9fff]/, id); }
    for (const place of Object.values(POIS)) assert.ok(place.nameZh?.trim(), `${place.id} has a Chinese name`);
  });
  it('follows the sample plan day by day and stop by stop', () => {
    assert.equal(PLAN_ZH.length, PLAN_TEMPLATE.daysData.length);
    PLAN_TEMPLATE.daysData.forEach((day, n) => {
      assert.ok(PLAN_ZH[n].title.trim() && PLAN_ZH[n].rainBackup.trim(), `day ${n + 1}`);
      assert.deepEqual(PLAN_ZH[n].stops.map((stop) => stop.poiId), day.stops.map((stop) => stop.poiId), `day ${n + 1} stops`);
      for (const stop of PLAN_ZH[n].stops) { assert.ok(stop.transport.trim() && stop.note.trim(), stop.poiId); assert.doesNotMatch(stop.transport + stop.note, /[A-Za-z]{3,}/, stop.poiId); }
    });
  });
  it('introduces every guide, topic for topic', () => {
    assert.deepEqual(Object.keys(GUIDE_ZH).sort(), GUIDES.map((guide) => guide.id).sort());
    for (const guide of GUIDES) {
      const local = GUIDE_ZH[guide.id];
      assert.ok(local.name.trim() && local.headline.trim() && local.bio.trim(), guide.id);
      assert.equal(local.topics.length, guide.topics.length, `${guide.id} topics`);
      assert.deepEqual(Object.keys(local).sort(), ['bio', 'headline', 'name', 'topics'], `${guide.id} changes wording only`);
    }
  });
  it('captions every film style within the caption limits', async () => {
    const { captionProblem } = await import('../assets/js/films.js');
    assert.deepEqual(Object.keys(CAPTIONS_ZH).sort(), FILM_STYLES.map((style) => style.id).sort());
    for (const style of FILM_STYLES) {
      assert.equal(CAPTIONS_ZH[style.id].length, style.captions.length, style.id);
      for (const caption of CAPTIONS_ZH[style.id]) { assert.ok(caption.trim()); assert.equal(captionProblem(caption), '', caption); }
    }
  });
  it('lets 小游 find a guide by their Chinese name', () => {
    assert.deepEqual(parseCommand('查看陈佳佳', { guides: GUIDES }), { kind: 'go', path: 'guides/guide_jiajia', guide: 'guide_jiajia' });
    assert.equal(parseCommand('黄俊杰', { guides: GUIDES })?.guide, 'guide_junjie');
    assert.equal(parseCommand('open Chen Jiajia', { guides: GUIDES })?.guide, 'guide_jiajia');
  });
});

describe('copy for domestic travellers', () => {
  const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  it('only replaces existing copy, in both languages, with the same placeholders', async () => {
    const overlay = { en: await json('../assets/messages/domestic.en.json'), zh: await json('../assets/messages/domestic.zh.json') };
    assert.deepEqual(Object.keys(overlay.en).sort(), Object.keys(overlay.zh).sort());
    assert.ok(Object.keys(overlay.zh).length > 0);
    for (const locale of ['en', 'zh']) {
      const base = Object.assign({}, ...await Promise.all([`${locale}.json`, ...FEATURES.map((feature) => `${feature}.${locale}.json`)].map((name) => json(`../assets/messages/${name}`))));
      for (const [key, value] of Object.entries(overlay[locale])) {
        assert.equal(typeof value, 'string', key); assert.ok(value.trim(), key);
        assert.ok(key in base, `${locale}: ${key} replaces existing copy`);
        assert.notEqual(value, base[key], `${locale}: ${key} differs from the visitor copy`);
        assert.deepEqual(holes(value), holes(base[key]), `${locale}: ${key} placeholders`);
      }
    }
  });
  it('drops the advice that only fits a visitor from abroad', async () => {
    const zh = Object.values(await json('../assets/messages/domestic.zh.json')).join('\n');
    const en = Object.values(await json('../assets/messages/domestic.en.json')).join('\n');
    assert.doesNotMatch(zh, /护照|落地|国际信用卡|美元|漫游|eSIM|WhatsApp|TikTok/i);
    assert.doesNotMatch(en, /\b(passport|lands?|landing|roaming|esim|dollars?|whatsapp|tiktok)\b/i);
    assert.match(zh, /身份证/); assert.match(zh, /微信支付和支付宝/); assert.match(zh, /人民币/);
    assert.equal(en.includes('!'), false);
  });
  it('keeps the card for a driver for anyone who reads in English', async () => {
    const sheet = await read('../assets/js/poi-sheet.js');
    assert.match(sheet, /const driverCard = !\(isDomestic\(\) && getLocale\(\) === 'zh'\);/);
    assert.match(sheet, /\$\{driverCard \? `<button class="btn btn--outline" data-driver>/);
    assert.match(sheet, /driver\?\.addEventListener\('click'/, 'the sheet still opens without the button');
  });
  it('names the traveller type in both languages', async () => {
    for (const locale of ['en', 'zh']) {
      const copy = await json(`../assets/messages/${locale}.json`);
      for (const key of ['you.audience', 'you.audience.note', 'share.system', 'share.caption.default', ...AUDIENCES.flatMap((kind) => [`audience.${kind}`, `audience.changed.${kind}`])]) assert.ok(copy[key]?.trim(), `${locale}: ${key}`);
    }
  });
});

describe('pages follow the language and the traveller type', { concurrency: false }, () => {
  let i18n, text, share;
  before(async () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory() });
    globalThis.document = { documentElement: {}, title: '' };
    globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(await readFile(url, 'utf8')) });
    i18n = await import('../assets/js/i18n.js');
    text = await import('../assets/js/seed-text.js');
    share = await import('../assets/js/share-sheet.js');
    await i18n.initI18n();
  });
  // setLocale does nothing when the language is already the one asked for.
  const use = async (locale, audience) => { await i18n.setLocale(locale === 'zh' ? 'en' : 'zh'); await i18n.setLocale(locale); setAudience(audience); };

  it('shows seed content in English with the Chinese name underneath', async () => {
    await use('en', 'inbound');
    const place = POIS.poi_yuyuan, plan = buildPlan(ARRIVAL), day = plan.daysData[0];
    assert.equal(text.placeName(place), place.nameEn); assert.equal(text.placeSubName(place), place.nameZh);
    assert.equal(text.placeDescription(place), place.descriptionEn);
    assert.equal(text.dayTitle(day), day.title); assert.equal(text.dayRainBackup(day), day.rainBackup);
    assert.deepEqual(text.stopText(day, day.stops[0]), { transport: day.stops[0].transport, note: day.stops[0].note });
    assert.equal(text.guideText(GUIDES[0]), GUIDES[0]);
    assert.deepEqual(text.captionsFor('SLOW_WALK'), FILM_STYLES.find((style) => style.id === 'SLOW_WALK').captions);
    assert.equal(text.mediaName({ id: 'sample_poi_yuyuan', alt: place.nameEn }), place.nameEn);
  });
  it('shows the same saved plan in Chinese, and leaves text it did not write alone', async () => {
    await use('zh', 'domestic');
    const place = POIS.poi_yuyuan, plan = buildPlan(ARRIVAL);
    assert.equal(text.placeName(place), place.nameZh); assert.equal(text.placeSubName(place), '');
    assert.equal(text.placeDescription(place), PLACE_ZH.poi_yuyuan.description);
    plan.daysData.forEach((day, n) => {
      assert.equal(text.dayTitle(day), PLAN_ZH[n].title); assert.equal(text.dayRainBackup(day), PLAN_ZH[n].rainBackup);
      day.stops.forEach((stop, i) => assert.deepEqual(text.stopText(day, stop), { transport: PLAN_ZH[n].stops[i].transport, note: PLAN_ZH[n].stops[i].note }));
    });
    assert.equal(plan.daysData[0].title, PLAN_TEMPLATE.daysData[0].titleEn, 'the saved plan itself is unchanged');
    const custom = { ...plan.daysData[0], title: 'A day from a planning service', rainBackup: 'Stay in.' };
    assert.equal(text.dayTitle(custom), custom.title); assert.equal(text.dayRainBackup(custom), 'Stay in.');
    assert.deepEqual(text.stopText(custom, custom.stops[0]), { transport: custom.stops[0].transport, note: custom.stops[0].note });
    const edited = { ...plan.daysData[0].stops[0], note: 'Meet at the gate.' };
    assert.equal(text.stopText(plan.daysData[0], edited).note, 'Meet at the gate.');
    const guide = text.guideText(GUIDES[0]);
    assert.equal(guide.name, GUIDE_ZH[GUIDES[0].id].name); assert.equal(guide.id, GUIDES[0].id); assert.equal(guide.priceHalfCents, GUIDES[0].priceHalfCents);
    assert.equal(GUIDES[0].name, 'Chen Jiajia', 'the seed record is not changed');
    assert.deepEqual(text.captionsFor('SLOW_WALK'), CAPTIONS_ZH.SLOW_WALK);
    assert.equal(text.mediaName({ id: 'sample_poi_yuyuan', alt: place.nameEn }), place.nameZh);
    assert.equal(text.mediaName({ id: 'm_own' }), i18n.t('studio.photo.own'));
  });
  it('swaps the copy with the traveller type and redraws whatever follows the language', async () => {
    await use('zh', 'inbound');
    const seen = [], stop = i18n.onLocaleChange((code) => seen.push(code));
    assert.match(i18n.t('hero.title'), /落地中国/); assert.match(i18n.t('arrive.budget.hint'), /美元/);
    setAudience('domestic');
    assert.deepEqual(seen, ['zh']);
    assert.doesNotMatch(i18n.t('hero.title'), /落地/); assert.match(i18n.t('arrive.budget.hint'), /人民币/);
    assert.match(i18n.t('support.answer.tickets'), /身份证/); assert.equal(i18n.t('nav.trip'), '行程', 'copy that is not replaced stays');
    await i18n.setLocale('en');
    assert.match(i18n.t('arrive.budget.hint'), /yuan/); assert.equal(i18n.t('arrive.when'), 'When do you arrive');
    setAudience('inbound');
    assert.equal(i18n.t('arrive.when'), 'When do you land'); assert.match(i18n.t('arrive.budget.hint'), /US dollars/);
    stop();
  });
  it('keeps the shared text within the limit with the right hashtags', async () => {
    for (const [audience, tag] of [['inbound', '#ChinaTravel #Along'], ['domestic', '#旅行 #Along']]) {
      await use('zh', audience);
      assert.equal(share.hashtags(), tag);
      for (const caption of ['', '好', i18n.t('share.caption.default'), '长'.repeat(500)]) {
        const out = share.shareText(caption);
        assert.ok(out.length <= share.MAX_SHARE, `${audience}: ${out.length}`); assert.ok(out.endsWith(tag));
      }
    }
    const source = await read('../assets/js/share-sheet.js');
    assert.match(source, /domestic\s*\? `<button class="btn \$\{outside\}" data-system/, 'domestic travellers get the phone share sheet');
    assert.match(source, /window\.Android\?\.shareText/);
  });
  it('starts in the phone language until a language has been chosen', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const phone = (tag) => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: [tag], language: tag } });
    try {
      for (const [tag, locale] of [['zh-CN', 'zh'], ['en-US', 'en'], ['zh-TW', 'zh'], ['ja-JP', 'en']]) {
        globalThis.localStorage.data.delete('instrip.locale');
        phone(tag);
        await i18n.initI18n();
        assert.equal(i18n.getLocale(), locale, tag);
      }
      globalThis.localStorage.setItem('instrip.locale', 'en');
      phone('zh-CN');
      await i18n.initI18n();
      assert.equal(i18n.getLocale(), 'en', 'a saved choice wins over the phone');
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else delete globalThis.navigator;
    }
  });
});
