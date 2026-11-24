// Along mobile — what 小游 can do at once, with no AI: open any page ("打开数字藏品"), find a place
// on the map ("带我去中山陵"), go back, open the camera, write a story, switch the language and
// turn display settings on or off. Pure: it only reads the words and returns what to do; the
// caller carries it out. Nothing outside these lists can be reached this way.
import { routePath } from './assistant-core.js';
// Local pages are listed below alongside the server's; LOCAL_ROUTES in assistant-core.js names them.
import { GUIDE_ZH } from './seed-zh.js';

// [route, Chinese words, English words]. The longest word found in a message wins, so
// "我的短片" opens the film library and "文创订单" the keepsake orders.
const PAGES = [
  ['trip', ['行程', '旅行计划', '我的计划', '计划页', '首页'], ['trip', 'itinerary', 'home']],
  ['friends', ['伙伴', '伴游', '向导', '导游', '志愿者', '本地朋友', '找朋友'], ['friends', 'guide', 'guides', 'volunteer', 'volunteers', 'local friend']],
  ['stories', ['故事', '社区', '帖子', '动态', '广场'], ['stories', 'community', 'posts']],
  ['you', ['我的页面', '个人中心', '设置', '账号', '账户', '我页'], ['settings', 'account', 'you tab']],
  ['support', ['帮助', '求助', '紧急', '报警', '急救', '客服'], ['help', 'support', 'emergency', 'sos']],
  ['map', ['地图', '导航'], ['map', 'navigation']],
  ['crafts', ['数字藏品', '藏品', '文创', '3d文创', '冰箱贴', '挂件', '钥匙扣'], ['keepsake', 'keepsakes', 'collectible', 'collectibles', 'digital collection', 'crafts']],
  ['craft-new', ['做文创', '制作文创', '新建文创', '新的文创', '做一个文创', '做冰箱贴', '做一个冰箱贴', '做挂件', '做一个挂件', '做钥匙扣', '做藏品', '制作藏品'], ['make a keepsake', 'new keepsake', 'create a keepsake']],
  ['saved', ['收藏'], ['saved', 'favorites', 'favourites', 'bookmarks']],
  ['travel', ['美食与住宿', '美食', '吃什么', '去哪吃', '餐厅', '餐馆', '住宿', '住哪', '酒店', '清真', '素食', '点菜卡'], ['food and stays', 'where to eat', 'restaurants', 'where to stay', 'hotels', 'halal', 'vegetarian']],
  ['orders', ['订单', '预约'], ['orders', 'bookings']],
  ['make-orders', ['文创订单', '制作订单', '藏品订单'], ['keepsake orders']],
  ['studio', ['短片', '做短片', '拍短片', '制作短片', '视频制作'], ['studio', 'film studio', 'make a film']],
  ['library', ['我的短片', '短片库'], ['my films', 'film library']],
  ['wallet', ['钱包', '银行卡', '付款方式', '支付方式', '绑卡', '加卡', '外国银行卡'], ['wallet', 'payment methods', 'payment method', 'my cards']],
  ['social', ['私信', '消息列表', '关注的人', '我关注的'], ['inbox', 'direct messages', 'who i follow']],
  ['profile', ['个人主页', '我的主页', '我的故事', '粉丝'], ['profile', 'my page', 'my stories', 'followers']],
  ['apply', ['成为伙伴', '申请伙伴', '成为向导', '申请成为', '当伙伴', '当向导'], ['become a guide', 'become a friend']],
  ['workshop', ['文创工坊', '手作工坊', '工坊', '做手工', '手作'], ['workshop', 'craft workshop', 'crafts workshop']],
  ['points', ['积分', '充值', '我的积分', '积分充值'], ['points', 'top up', 'my points']],
  ['beads', ['拼豆', '拼豆图纸', '做拼豆', '拼豆材料'], ['perler', 'perler beads', 'fuse beads', 'bead pattern']],
  ['clay-new', ['捏泥', '捏个', '捏泥巴', '3d建模', '捏模型', '捏一个', '图生3d', '照片生成3d'], ['clay', 'sculpt', 'pinch clay', '3d model']],
  ['gallery', ['文创画廊', '画廊', '作品画廊', '二创'], ['gallery', 'craft gallery', 'remix']],
];
const ACTIONS = [
  ['camera', ['拍照', '拍张照', '拍一张', '打开相机', '相机', '照相'], ['camera', 'take a photo', 'take a picture']],
  ['post', ['发帖', '发故事', '发个故事', '发一个故事', '发布故事', '写故事', '分享故事', '发动态', '发个动态', '发一条'], ['post a story', 'write a post', 'share a story', 'new post']],
  ['back', ['返回上一页', '上一页', '后退', '返回', '退回'], ['go back', 'back']],
];

// Words that ask to be taken somewhere. Without one, a message that is only a page name still counts.
const GO_ZH = /(去|打开|开一下|跳转|跳到|进入|转到|切到|切换到|带我|看看|看一下|查看|显示|回到|返回|前往|帮我开|找个|找一个|找一位|预约)/;
const GO_EN = /\b(go to|go|open|take me|show me|show|navigate|switch to|bring me|let me see|view|visit|head to)\b/;
// A place is only looked up on the map when the message asks how to get there, not just mentions it.
const GO_PLACE_ZH = /(去|带我|前往|打开|到达)/;
const GO_PLACE_EN = /\b(go to|take me|bring me|head to|get to|open)\b/;
// Stricter: used to decide whether an AI answer's first link is followed at once.
const TAKE_ZH = /(打开|跳转|跳到|进入|带我去|带我到|导航到|导航去|切换到|前往|帮我打开)/;
const TAKE_EN = /\b(open|take me|go to|navigate|bring me)\b/;
const PLACE_ZH = /(导航|怎么走|怎么去|在哪|路线|地图)/;
const PLACE_EN = /\b(directions?|route|how (do i|to) get|where is|navigate|map)\b/;
const FILLER = /(请|帮我|麻烦|小游|我想|我要|一下|页面|页|界面|吧|呢|啊|呀|哦|了|的|please|the|page|tab|screen|my|now|i want to|i want|i'd like to)/g;

const ON = /(打开|开启|启用|开|turn on|enable|switch on)/;
const OFF = /(关闭|关掉|关上|停用|不要|取消|关|turn off|disable|switch off)/;

const normal = (text) => String(text || '').toLowerCase().replace(/[，。！？、,.!?~～:：;；"“”'‘’()（）]+/g, ' ').replace(/\s+/g, ' ').trim();
const compact = (text) => text.replace(/\s+/g, '');
const english = (word) => /^[a-z0-9 ]+$/.test(word);

function found(text, word) {
  if (!english(word)) return compact(text).includes(compact(word));
  return new RegExp(`(^|[^a-z])${word.replace(/ /g, '\\s+')}($|[^a-z])`).test(text);
}
// Only the asked-for name and polite words: "数字藏品页", "请打开钱包", "my wallet please".
function bare(text, word) {
  const rest = english(word) ? text.replace(new RegExp(word.replace(/ /g, '\\s+')), ' ') : compact(text).replace(compact(word), '');
  return rest.replace(FILLER, '').replace(/\s+/g, '').length <= 1;
}
const wantsGo = (text) => GO_ZH.test(text) || GO_EN.test(text);

function placeWords(place) {
  const words = new Set();
  const add = (word) => { const w = normal(word); if (w.length >= 2) words.add(w); };
  add(place.nameZh); add(String(place.nameZh || '').split(/[·・/]/)[0]);
  add(place.nameEn); add(String(place.nameEn || '').split(/[&,(]/)[0]);
  for (const alias of place.aliases || []) add(alias);
  return [...words].filter((w) => !english(w) || w.length >= 4);
}
function guideWords(guide) {
  const name = normal(guide.name), parts = name.split(' ');
  const zh = normal(GUIDE_ZH[guide.id]?.name);
  return [name, ...parts.filter((p) => p.length >= 4), ...(zh.length >= 2 ? [zh] : [])];
}

function settingCommand(text) {
  const off = OFF.test(text), on = !off && ON.test(text);
  if (!off && !on) return null;
  if (/(大字号|大字|字大|老年模式|长辈模式|简化布局|large text|bigger text|senior)/.test(text)) return { kind: 'setting', key: 'senior', value: on };
  if (/(减少动态|减少动画|reduce motion|reduced motion)/.test(text)) return { kind: 'setting', key: 'motion', value: on ? 'reduced' : 'auto' };
  if (/(动画|动效|animation)/.test(text)) return { kind: 'setting', key: 'motion', value: on ? 'auto' : 'reduced' };
  if (off && /(小游|assistant)/.test(text)) return { kind: 'setting', key: 'assistant', value: false };
  return null;
}
function localeCommand(text) {
  // "用英文怎么说" asks for a translation, not a new language.
  if (/(怎么说|翻译|译成|translate|say)/.test(text)) return null;
  if (!/(切换|换成|改成|改为|设置为|设为|语言|界面|switch|change|set|language|interface)/.test(text)) return null;
  if (/(英文|英语|english)/.test(text)) return { kind: 'locale', value: 'en' };
  if (/(中文|汉语|普通话|chinese)/.test(text)) return { kind: 'locale', value: 'zh' };
  return null;
}

/**
 * Read one message. Returns null when it is not a command (then it goes to the AI), else one of
 * { kind: 'go', path, route | place | guide }, { kind: 'back' | 'camera' | 'post' },
 * { kind: 'locale', value } or { kind: 'setting', key, value }.
 */
export function parseCommand(message, { places = {}, guides = [] } = {}) {
  const text = normal(message);
  if (!text || text.length > 80) return null;
  const direct = settingCommand(text) || localeCommand(text);
  if (direct) return direct;

  const candidates = [];
  for (const place of Object.values(places)) for (const word of placeWords(place)) candidates.push({ word, type: 'place', id: place.id });
  for (const guide of guides) for (const word of guideWords(guide)) candidates.push({ word, type: 'guide', id: guide.id });
  for (const [route, zh, en] of PAGES) for (const word of [...zh, ...en]) candidates.push({ word, type: 'page', id: route });
  for (const [action, zh, en] of ACTIONS) for (const word of [...zh, ...en]) candidates.push({ word, type: 'action', id: action });
  const match = candidates.filter((c) => found(text, normal(c.word))).sort((a, b) => compact(b.word).length - compact(a.word).length)[0];
  if (!match) return null;

  const word = normal(match.word), plain = bare(text, word);
  if (match.type === 'place') {
    if (!plain && !GO_PLACE_ZH.test(text) && !GO_PLACE_EN.test(text) && !PLACE_ZH.test(text) && !PLACE_EN.test(text)) return null;
    return { kind: 'go', path: `map/${encodeURIComponent(match.id)}`, place: match.id };
  }
  if (!plain && !wantsGo(text)) return null;
  if (match.type === 'guide') return { kind: 'go', path: `guides/${encodeURIComponent(match.id)}`, guide: match.id };
  if (match.type === 'action') return { kind: match.id };
  return { kind: 'go', path: routePath(match.id), route: match.id };
}

/** Whether the user asked to be taken somewhere, so an AI answer's first link is followed at once. */
export const asksToGo = (message) => { const text = normal(message); return TAKE_ZH.test(text) || TAKE_EN.test(text); };
