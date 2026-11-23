// The film's single source of truth: shots, voice-over, captions, chapters.
// All frame numbers here are ABSOLUTE (frame 0 = first frame of the film).
import VO_DUR from './vo-durations.json';
import VO_WORDS from './vo-words.json';
import VO_LINES from './vo-lines.json';

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const TOTAL = 2700;

export type ShotId = 'S00' | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11';
export type Shot = {
  id: ShotId;
  label: string;
  from: number; // nominal start
  dur: number; // nominal length
  pre: number; // frames rendered before `from` (underneath the previous shot's transition)
  post: number; // frames rendered after the nominal end (the shot owns its outgoing transition)
  z: number; // stacking: higher is on top
  owner: string;
};

export const SHOTS: Shot[] = [
  { id: 'S00', label: 'S00 舷窗开场', from: 0, dur: 126, pre: 0, post: 0, z: 2, owner: 'B' },
  { id: 'S01', label: 'S01 市场与数据', from: 126, dur: 279, pre: 20, post: 0, z: 1, owner: 'B' },
  { id: 'S02', label: 'S02 痛点盖章', from: 405, dur: 245, pre: 0, post: 10, z: 2, owner: 'B' },
  { id: 'S03', label: 'S03 手机与小游', from: 650, dur: 255, pre: 35, post: 0, z: 1, owner: 'C1' },
  { id: 'S04', label: 'S04 三天行程', from: 905, dur: 255, pre: 0, post: 0, z: 1, owner: 'C1' },
  { id: 'S05', label: 'S05 导航与伙伴', from: 1160, dur: 255, pre: 0, post: 0, z: 1, owner: 'C1' },
  { id: 'S06', label: 'S06 拍照发布', from: 1415, dur: 225, pre: 0, post: 0, z: 1, owner: 'C2' },
  { id: 'S07', label: 'S07 3D 文创', from: 1640, dur: 275, pre: 0, post: 5, z: 3, owner: 'C2' },
  { id: 'S08', label: 'S08 对接国际旅行社', from: 1915, dur: 270, pre: 15, post: 10, z: 2, owner: 'D' },
  { id: 'S09', label: 'S09 记忆馆', from: 2185, dur: 215, pre: 20, post: 10, z: 1, owner: 'D' },
  { id: 'S10', label: 'S10 文创拼标志', from: 2366, dur: 134, pre: 0, post: 0, z: 3, owner: 'D' },
  { id: 'S11', label: 'S11 小游与口号', from: 2500, dur: 200, pre: 0, post: 0, z: 1, owner: 'D' },
];

export const shot = (id: ShotId) => SHOTS.find((s) => s.id === id)!;

// ---------- voice-over ----------
export type VoId = 'N1' | 'N2' | 'X1' | 'X2' | 'X3' | 'X4' | 'X5' | 'N3' | 'N4' | 'X6';
export const VO_START: Record<VoId, number> = {
  N1: 138, N2: 430, X1: 690, X2: 950, X3: 1185, X4: 1430, X5: 1665, N3: 1935, N4: 2280, X6: 2540,
};
export const VO_FRAMES = (id: VoId) => Math.ceil((VO_DUR as Record<string, number>)[id] * FPS);
export const VO_LINE = (id: VoId) => (VO_LINES as { id: string; zh: string; en: string; who: string }[]).find((l) => l.id === id)!;

/** Absolute frame at which `word` (any substring of the line) starts being spoken; nth = which occurrence. */
export function cue(id: VoId, word: string, nth = 0): number {
  const words = (VO_WORDS as unknown as Record<string, [string, number, number][]>)[id];
  let text = '';
  const starts: number[] = [];
  for (const [w] of words) { starts.push(text.length); text += w; }
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(word, at + 1);
  if (at < 0) throw new Error(`cue: "${word}" not in ${id} (${text})`);
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1] <= at) k++;
  return VO_START[id] + Math.round(words[k][1] * FPS);
}
/** Absolute frame at which `word` finishes. */
export function cueEnd(id: VoId, word: string, nth = 0): number {
  const words = (VO_WORDS as unknown as Record<string, [string, number, number][]>)[id];
  let text = '';
  const ends: number[] = [];
  for (const [w, , e] of words) { text += w; ends.push(text.length); void e; }
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(word, at + 1);
  if (at < 0) throw new Error(`cueEnd: "${word}" not in ${id}`);
  const last = at + word.length;
  const k = ends.findIndex((e) => e >= last);
  return VO_START[id] + Math.round(words[k][2] * FPS);
}

// ---------- captions (bottom, bilingual) ----------
export type CaptionLine = { vo: VoId; at?: string; zh: string; en: string; tone: 'night' | 'day' };
export const CAPTION_LINES: CaptionLine[] = [
  { vo: 'N1', zh: '过境免签扩展到 57 国。', en: 'Visa-free transit now covers 57 countries.', tone: 'night' },
  { vo: 'N1', at: '今年', zh: '今年三季度，免签入境的外国人同比增长 24.1%。', en: 'In Q3, visa-free entries by foreigners rose 24.1%.', tone: 'night' },
  { vo: 'N2', zh: '可落地之后，支付、语言、导航、订票，处处是门槛。', en: 'But after landing, paying, talking, getting around and booking are all hard.', tone: 'night' },
  { vo: 'X1', zh: '你好！我是小游！导航、翻译、行程，放心交给我！', en: "Hi! I'm Along! Directions, translation, your trip: leave them to me!", tone: 'day' },
  { vo: 'X2', zh: '告诉我你哪天落地，热门景点，三天行程马上排好！', en: "Tell me when you land, and I'll plan three days around the top sights!", tone: 'day' },
  { vo: 'X3', zh: '想去哪儿，我带你走；还能约一位本地伙伴，陪你一起逛！', en: "I'll walk you anywhere, or book a local friend to explore with you!", tone: 'day' },
  { vo: 'X4', zh: '长按中间的按钮，拍下这一刻，发到社区和 TikTok！', en: 'Hold the middle button, catch the moment, share it to Stories and TikTok!', tone: 'day' },
  { vo: 'X5', zh: '再把照片变成 3D 冰箱贴，动漫风一键切换，还能寄到家！', en: 'Make it a 3D fridge magnet, switch to anime in one tap, ship it home!', tone: 'day' },
  { vo: 'N3', zh: '下一步，Along 将对接国际旅行社的入境游业务，', en: "Next, Along will plug into international travel agencies' inbound tours,", tone: 'day' },
  { vo: 'N3', at: '让更多', zh: '让更多外国游客，感受中国的山水风光。', en: "so more visitors can see China's landscapes.", tone: 'day' },
  { vo: 'N4', zh: '每一段旅途，都值得被收藏。', en: 'Every journey deserves to be kept.', tone: 'day' },
];

export type Caption = CaptionLine & { from: number; to: number; who: string };
export const CAPTIONS: Caption[] = CAPTION_LINES.map((c, i) => {
  const from = (c.at ? cue(c.vo, c.at) : VO_START[c.vo]) - 3;
  const next = CAPTION_LINES[i + 1];
  const to = next && next.vo === c.vo ? cue(next.vo, next.at!) - 3 : VO_START[c.vo] + VO_FRAMES(c.vo) + 10;
  return { ...c, from, to, who: VO_LINE(c.vo).who };
});

// ---------- chapter rail (top-left) ----------
export const CHAPTERS = [
  { n: '01', zh: '发现市场', en: 'Market', from: 126, to: 650, tone: 'night' as const },
  { n: '02', zh: '做出产品', en: 'Product', from: 650, to: 1915, tone: 'day' as const },
  { n: '03', zh: '成果落地', en: 'Go global', from: 1915, to: 2185, tone: 'day' as const },
  { n: '04', zh: '一起游', en: 'Along', from: 2185, to: 2500, tone: 'day' as const },
];
// "Sample data" note (top-right) while app screens are on.
export const SAMPLE_NOTE = { from: 650, to: 1915 };
