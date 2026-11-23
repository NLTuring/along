// Workbench manifest — how the film decomposes into editable clips (video-shotcraft workbench,
// `node workbench/scripts/open.mjs <this project>`). Every table is imported from timeline.ts /
// Main.tsx / sfx.ts, so the workbench reads the same timing the film renders with.
// Shots are time/layer-editable; captions expose their copy, tone and sizes.
import { createElement, type FC } from 'react';
import { AbsoluteFill } from 'remotion';
import { AlongMain, SCENES } from './Main';
import { CAPTIONS, SHOTS, TOTAL, VO_FRAMES, VO_START, VoId, Shot } from './timeline';
import { ShotScope } from './lib/shot';
import { CaptionView, CAPTION_DEFAULTS, ChapterRail, SampleNote } from './components/Overlays';
import { SFX, sfxDuration } from './sfx';

type Field = Record<string, unknown> & { type: string; key: string; label: string; default: unknown };
const text = (key: string, label: string, def: string): Field => ({ type: 'text', key, label, default: def });
const size = (key: string, label: string, def: number, min: number, max: number): Field => ({
  type: 'slider', key, label, default: def, min, max, step: 1, unit: 'px',
});

// A scene placed by the workbench: the clip starts at `from - pre`, exactly like <ShotSeq>.
const shotUnit = (s: Shot): FC<Record<string, unknown>> => {
  const Scene = SCENES[s.id]!;
  const Unit: FC = () =>
    createElement(AbsoluteFill, { style: { zIndex: s.z } }, createElement(ShotScope, { shot: s, children: createElement(Scene) }));
  Unit.displayName = `Scene${s.id}`;
  return Unit as FC<Record<string, unknown>>;
};

const CAPTION_SCHEMA: Field[] = [
  text('zh', '中文字幕', ''),
  text('en', '英文字幕', ''),
  { type: 'select', key: 'tone', label: '底色', default: 'day', options: [{ value: 'day', label: '浅色（白天）' }, { value: 'night', label: '深色（夜）' }] },
  size('zhSize', '中文字号', CAPTION_DEFAULTS.zhSize, 40, 80),
  size('enSize', '英文字号', CAPTION_DEFAULTS.enSize, 24, 56),
  size('bottom', '底边距', CAPTION_DEFAULTS.bottom, 0, 300),
];

export const WORKBENCH = {
  name: 'Along 一起游 · 介绍视频',
  fps: 30,
  width: 1920,
  height: 1080,
  total: TOTAL,
  background: '#000000',
  shots: SHOTS.map((s) => ({
    id: s.id,
    label: s.label,
    from: s.from - s.pre,
    duration: s.pre + s.dur + s.post,
    component: shotUnit(s),
    cardId: `scene-${s.id}`,
    cardName: s.label,
  })),
  captions: CAPTIONS.map((c, i) => ({
    id: `caption-${i + 1}`,
    label: c.zh,
    from: c.from,
    duration: c.to - c.from,
    component: CaptionView as FC<Record<string, unknown>>,
    props: { zh: c.zh, en: c.en, tone: c.tone, who: c.who, ...CAPTION_DEFAULTS },
    schema: CAPTION_SCHEMA,
    durationProp: 'duration',
    cardId: 'caption',
    cardName: '中英字幕',
  })),
  overlays: [
    { id: 'chapters', label: '章节条', from: 0, duration: TOTAL, component: ChapterRail as FC<Record<string, unknown>>, cardId: 'chapters', cardName: '章节条' },
    { id: 'sample-note', label: '示例数据提示', from: 0, duration: TOTAL, component: SampleNote as FC<Record<string, unknown>>, cardId: 'sample-note', cardName: '示例数据提示' },
  ],
  sfx: [
    ...(Object.keys(VO_START) as VoId[]).map((id) => ({ from: VO_START[id], duration: VO_FRAMES(id) + 6, src: `vo/${id}.mp3`, volume: 1 })),
    ...SFX.map((s) => ({ from: s.from, duration: sfxDuration(s), src: `sfx/${s.src}`, volume: s.volume })),
  ],
  order: ['captions', 'overlays', 'transitions'] as const,
  original: AlongMain as FC<Record<string, unknown>>,
};
