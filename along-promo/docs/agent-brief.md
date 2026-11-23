# 场景制作 Agent 通用说明（所有场景 Agent 必读）

工程：仓库根目录下的 `along-promo`（Remotion 4.0.484，React 19，1920×1080，30fps）。
先读：`docs/design-spec.md`、`docs/storyboard.md`（你的镜头行 + 接缝契约），再读本文件。
技能库：`video-shotcraft` 技能（下称 SKILL）。

## 1. 你能改什么

- 只改/新建：你名下的 `src/scenes/Sxx.tsx`，以及你自己的子目录 `src/scenes/<你的镜头号>/`（例如 `src/scenes/S01/WorldMap.tsx`）。
- 只读、不要改：`src/timeline.ts`、`src/tokens.ts`、`src/fonts.ts`、`src/lib/*`、`src/components/*`、`src/Main.tsx`、`src/Root.tsx`、`src/entry-*.ts`、其他人的场景、`public/` 下已有文件。
- 需要新素材：放进 `public/scenes/<镜头号>/`（只放你自己的）。需要改共享文件：不要改，写进最终报告。
- 不要 git 操作，不要装 npm 包（three / @react-three/fiber / @remotion/three 已装）。不要改业务项目（工程目录外）。

## 2. 场景写法

```tsx
import { useShotFrame, useLocal } from '../lib/shot';
import { cue } from '../timeline';
export const S04_BEATS = { cardsOut: 80, warnLock: 150 };   // 本地帧号：关键动作，供制作 Agent 钉音效
export const S04: React.FC = () => {
  const f = useShotFrame();            // 0 = 本镜名义起点；pre-roll 期间为负数
  const at = useLocal();
  const tLand = at(cue('X2', '落地'));  // 旁白说到「落地」的本地帧
  ...
};
```
- 导出名必须是 `Sxx` 和 `Sxx_BEATS`（Main 按此 import）。BEATS 里写**本地帧号**（相对本镜名义起点）。
- 时间线、旁白起点、逐词时间都在 `src/timeline.ts`（`SHOTS` / `VO_START` / `cue()` / `cueEnd()`）。画面动作钉在旁白词上用 `cue()`，不要手抄帧号。
- 颜色、字体、缓动、时值全部从 `src/tokens.ts` 取（`C` / `SKY` / `FONT` / `EASE` / `T` / `GLASS`）。不要另造配色。
- **确定性**：禁止 `Math.random()` / `Date.now()` / 无参 `new Date()`；伪随机用固定种子（可抄 SKILL `assets/lib/helpers/rand.ts` 的 mulberry32）。一切 tween `interpolate(..., { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })`。
- 只用 `useCurrentFrame` 驱动动画；不要 CSS animation/transition。
- 3D：CSS 3D 用 `components/Phone3D.tsx` 的 `Stage3D` / `Phone3D` / `Screen` / `SoftShadow`。手机大小用 `height` 属性，不要用 translateZ/scale 把它推近放大（会糊，审美准则 Q2）。Phone3D 的祖先不能有 overflow/filter/opacity<1。three.js 用 `@remotion/three` 的 `ThreeCanvas`（宽高写死 1920×1080）。
- 小游：`components/Mascot2D.tsx`（App 原版 SVG 角色，表情 expression × 动作 action，全部按帧算）。
- 标志：`components/LogoInk.tsx`（网站同款笔顺写字，`progress` 0→1，`settle` 0→1）。
- 背景：`components/Paper.tsx` 的 `Sky`（产品天色渐变 + 纸纹）、`PaperBg`、`Grain`。

## 3. 版面禁区（全片叠加层由制作 Agent 统一画）

- 底部字幕带 y≥860：有旁白的镜头里不要放要读的信息。
- 左上 360×110（章节条）、右上 420×80（示例数据小字，仅产品章）留空。
- 字号（审美准则 Q11，按最终像素量）：要读的标题/数字 ≥56px，辅助说明/标签 ≥32px；装饰性小字（截图里的、纹理）不在此列但不要让人想去读。
- 中文用 `FONT.serifZh`（标题）/ `FONT.sans`（说明）；英文/数字用 `FONT.serif`（Source Serif 4）。

## 4. 质量规则（SKILL `references/aesthetic-rules.md` 全文必读，以下是重点）

- **用镜头卡必须读准确 demo 源码**：先在 `SKILL/gallery/api/library.json` 里核对卡名与 style-key → 读卡片全文 `SKILL/references/shots/<类别>/<卡>.md` → 按卡片「参考实现」找到 `SKILL/demos/...` 里准确的 TSX 读全文 → 再改写到本片。卡上「已知坑/命门」的参数不得降档。允许按本片 tokens 重新蒙皮（颜色/字体/材质换成 Along 的），保留运动语法、时值配比、缓动。
- 每镜只讲一个主动效；关键信息落定后 hold；批量入场越来越快、收尾停 0.5s；节奏宁慢勿快。
- 光效不群发，一个镜头最多给主角一次，并裁进圆角。产品片不加手持抖动。
- 飞入元素要落进真实槽位，不要悬浮。
- 信息密度要高（用户硬要求）：每个画面都要有可读的具体信息（数据、标签、功能名、价格、时间），不要空镜。

## 5. 自检（必须做，做完才能报告完成）

```bat
cd along-promo
set TEMP=D:\along-tmp&& set TMP=D:\along-tmp&& npx remotion still src/entry-<你的组>.ts Shot-S04 out/qa/<你的组>/S04-f1000.png --frame=1000
```
- 帧号是**绝对帧**（全片帧号）。`Range-<组>` 合成带字幕/章节条叠加层，可用来查版面冲突。
- 每个镜头至少出 4 张静帧（入场中 / 主动作峰值 / 落定后 / 接缝前后各一帧），用 Read 工具打开**亲眼看**：构图、穿帮、文字是否清晰、是否被字幕挡。
- 动作检查：`npx remotion render src/entry-<组>.ts Range-<组> out/qa/<组>/range.mp4 --frames=<起>-<止> --scale=0.5`，再用 ffmpeg 抽帧拼 contact sheet 看运动是否顺、有无跳帧。
- 输出只放 `out/qa/<你的组>/`。

## 6. 最终报告（你的最后一条消息）

1. 改/新建的文件列表；2. 每个镜头实际用了哪张卡 · style-key · 读了哪个 demo 文件；3. `Sxx_BEATS` 内容（本地帧号 + 含义，供配音效）；4. 自检静帧路径和你看到的问题；5. 对共享文件/时间线的修改建议（如有）；6. 与 storyboard 的偏差及理由。不要贴大段代码。
