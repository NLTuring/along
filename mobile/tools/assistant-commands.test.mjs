// 小游 can drive the whole app: page names, places, back, camera, posting, language and display settings.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseCommand, asksToGo } from '../assets/js/assistant-commands.js';
import { clientActions, ASSISTANT_ROUTES, routePath } from '../assets/js/assistant-core.js';
import { POIS } from '../assets/js/seed-places.js';
import { GUIDES } from '../assets/js/seed.js';
import { WINDOW_PLACES } from '../assets/js/window-scenes.js';

globalThis.window ??= globalThis;
const { parseHash } = await import('../assets/js/router.js');
const places = { ...POIS, ...WINDOW_PLACES };
const parse = (text) => parseCommand(text, { places, guides: GUIDES });
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('小游 commands', () => {
  it('opens pages by name, in Chinese or English, with or without "go"', () => {
    const cases = {
      '我要去数字藏品页': 'crafts', '数字藏品': 'crafts', '打开 3D 文创': 'crafts', '打开钱包': 'wallet', '我想绑一张Visa卡': null,
      '我的短片': 'library', '文创订单': 'make-orders', '帮我做一个冰箱贴': 'craft-new', '打开私信': 'social', '我的主页': 'profile',
      '查看收藏': 'saved', '帮助': 'support', '去行程': 'trip', '找个向导': 'friends', '打开订单': 'orders',
      'open my wallet': 'wallet', 'go to stories': 'stories', 'show my profile': 'profile', 'keepsakes': 'crafts',
    };
    for (const [text, route] of Object.entries(cases)) {
      const command = parse(text);
      if (route === null) continue;
      assert.equal(command?.kind, 'go', text); assert.equal(command.route, route, text); assert.equal(command.path, routePath(route));
    }
  });
  it('every page it can open is a real route', () => {
    for (const route of ASSISTANT_ROUTES) {
      const path = routePath(route), parsed = parseHash(`#/${path}`);
      assert.equal(parsed.key, path, `${route} opens ${path}`);
    }
    assert.equal(routePath('profile'), 'u/me'); assert.equal(routePath('craft-new'), 'craft/new');
  });
  it('takes you to a place on the map: trip stops and the window places', () => {
    assert.deepEqual(parse('带我去中山陵'), { kind: 'go', path: 'map/poi_zhongshan', place: 'poi_zhongshan' });
    assert.equal(parse('中山陵怎么走').place, 'poi_zhongshan');
    assert.equal(parse('去东方明珠').place, 'view_pearl');
    assert.equal(parse('take me to the bund').place, 'view_bund');
    assert.equal(parse('how do I get to Jiming Temple').place, 'poi_jiming');
    assert.equal(parse('导航到夫子庙').place, 'poi_fuzimiao');
  });
  it('does the in-app actions and settings', () => {
    assert.deepEqual(parse('返回'), { kind: 'back' });
    assert.deepEqual(parse('打开相机'), { kind: 'camera' });
    assert.deepEqual(parse('我想发个故事'), { kind: 'post' });
    assert.deepEqual(parse('切换成英文'), { kind: 'locale', value: 'en' });
    assert.deepEqual(parse('把语言改成中文'), { kind: 'locale', value: 'zh' });
    assert.deepEqual(parse('switch to Chinese'), { kind: 'locale', value: 'zh' });
    assert.deepEqual(parse('打开大字号'), { kind: 'setting', key: 'senior', value: true });
    assert.deepEqual(parse('关闭动画'), { kind: 'setting', key: 'motion', value: 'reduced' });
    assert.deepEqual(parse('关掉小游'), { kind: 'setting', key: 'assistant', value: false });
  });
  it('leaves questions, translations and chat to the AI', () => {
    for (const text of ['南京有什么好玩的', '推荐一个博物馆', '用英文怎么说谢谢', '翻译：请带我去这个地址', '介绍一下外滩', '我想吃小笼包', 'what is the weather', '中山陵几点开门', '', 'x'.repeat(200)]) {
      assert.equal(parse(text), null, text);
    }
  });
  it('only says "take me" when asked, so AI links are followed then and only then', () => {
    for (const text of ['带我去一个适合拍照的地方', '帮我打开能付款的页面', 'take me somewhere quiet', '导航到最近的博物馆']) assert.ok(asksToGo(text), text);
    for (const text of ['推荐两个地方', '这里怎么用', 'what can I do in Nanjing']) assert.ok(!asksToGo(text), text);
  });
  it('AI actions open the new pages too, still from a closed list', () => {
    assert.deepEqual(clientActions([{ type: 'open', route: 'wallet' }, { type: 'open', route: 'profile' }, { type: 'open', route: 'admin' }, { type: 'open', route: 'craft-new' }]),
      [{ type: 'open', route: 'wallet', path: 'wallet' }, { type: 'open', route: 'profile', path: 'u/me' }, { type: 'open', route: 'craft-new', path: 'craft/new' }]);
  });
  it('is wired into the chat: commands run without AI or sign-in, and every page has a name', async () => {
    const source = await read('../assets/js/assistant.js');
    const send = source.slice(source.indexOf('async function send'), source.indexOf('const state = availability();'));
    assert.match(send, /parseCommand\(message/); assert.doesNotMatch(send, /api\(/);
    assert.match(source, /asksToGo\(message\) && actions\.find/);
    for (const locale of ['zh', 'en']) {
      const copy = JSON.parse(await read(`../assets/messages/assistant.${locale}.json`));
      for (const route of ASSISTANT_ROUTES) assert.ok(copy[`assistant.page.${route}`], `${locale} names ${route}`);
      for (const key of ['open', 'place', 'guide', 'back', 'camera', 'post', 'locale.en', 'locale.zh', 'senior.on', 'senior.off', 'motion.on', 'motion.off', 'assistant.off', 'following']) assert.ok(copy[`assistant.do.${key}`], `${locale} assistant.do.${key}`);
    }
    const server = await read('../../server/src/assistant.ts');
    const routes = /OPEN_ROUTES = \[([^\]]+)\]/.exec(server)[1].match(/'([a-z-]+)'/g).map((s) => s.slice(1, -1));
    assert.deepEqual(routes, ASSISTANT_ROUTES, 'server and app agree on the pages');
  });
});

describe('3D keepsake AI window', () => {
  it('shows a floating window with what the AI is doing, a timer, Cancel and Retry', async () => {
    const page = await read('../assets/js/page-craft.js');
    assert.match(page, /<section class="craft-ai glass glass--2" data-ai hidden/);
    assert.match(page, /data-ai-title[\s\S]*data-ai-detail[\s\S]*data-ai-time/);
    assert.match(page, /class="craft-ai__actions"><button[^>]*data-retry hidden[^>]*>[\s\S]*?data-cancel-job/);
    // The style panel no longer carries the cancel and retry buttons for every AI step.
    const style = page.slice(page.indexOf('craft-style-title'), page.indexOf('craft-raise-title'));
    assert.doesNotMatch(style, /data-cancel-job|data-retry/);
    assert.match(page, /showAI\(variant, t\('craft3d\.ai\.preparing'\)\)/);
    assert.match(page, /failAI\(reason\)/);
    const cancel = page.slice(page.indexOf('function cancelOperation'), page.indexOf('function providerName'));
    assert.match(cancel, /runner\.cancel\(\)/); assert.match(cancel, /uploadAbort\?\.abort\(\)/); assert.match(cancel, /hideAI\(\)/);
    assert.match(page, /clearInterval\(aiTimer\)/);
    const copy = JSON.parse(await read('../assets/messages/craft-online.zh.json'));
    assert.equal(copy['craft3d.ai.ANIME.title'], 'AI 正在转换成动画风格');
    assert.equal(copy['craft3d.ai.REAL.title'], 'AI 正在识别人物');
    const css = await read('../assets/css/craft-online.css');
    assert.match(css, /\.craft-ai \{[\s\S]*position: fixed/);
  });
});
