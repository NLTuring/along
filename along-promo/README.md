# Along 一起游 · 介绍视频工程

90 秒（2700 帧）· 1920×1080 · 30fps · 中文旁白 + 中英字幕 · 无 BGM（旁白 + 小游配音 + 音效）。
Remotion 4.0.484 工程；成片在 `out/`。

## 常用命令（Windows，在本目录执行）

```bat
set TEMP=D:\along-tmp&& set TMP=D:\along-tmp
npx remotion studio src/index.ts                                   :: 预览/调试
npx remotion render src/index.ts AlongPromo out/along-promo.mp4 --concurrency=12 --crf=16 --audio-bitrate=320k
npx remotion still  src/index.ts AlongPromo out/qa/f1000.png --frame=1000
```

## 结构

| 位置 | 内容 |
|---|---|
| `docs/design-spec.md`、`docs/storyboard.md` | 产品简报、需求决策表、视觉方向与 tokens、分镜与帧级时间轴、接缝契约 |
| `src/timeline.ts` | 唯一时间表：镜头 / 旁白起点 / 逐词钉点 `cue()` / 字幕 / 章节条 |
| `src/scenes/S00–S11.tsx` | 12 个镜头；`src/scenes/phone/` 是 App 段共用的手机、小游、地图、冰箱贴 |
| `src/components/` | Phone3D（CSS 3D 手机）、Mascot2D（App 原版小游 SVG）、LogoInk（网站同款笔顺写字）、Overlays（字幕/章节条） |
| `src/sfx.ts` | 音效钉帧表（钉在各镜头导出的 BEATS 上） |
| `src/vo-lines.json` | 旁白与小游台词（中英） |
| `public/apk/` | App 真实页面截图（`capture/capture_apk.py` 从最新 APK 的页面离线截取） |
| `public/web/` | 网站记忆馆真实录帧（`capture/capture_museum.py`，虚拟时钟逐帧录制，4K） |

## 改台词 / 换配音

1. 改 `src/vo-lines.json` 的 `tts`（读音）、`zh` / `en`（字幕）。
2. `python tools/gen_vo.py`（Edge 神经语音：旁白 晓晓 zh-CN-XiaoxiaoNeural，小游 云夏 zh-CN-YunxiaNeural 升调），再按 `tools/check_vo.py` 的方式做响度归一（-16 LUFS）。
3. 想换成真人录音：把录好的 `N1.mp3 … X6.mp3` 同名放进 `public/vo/`，语速尽量贴着现在的 AI 配音（画面动作钉在逐词时间 `src/vo-words.json` 上）。录音长短差得多时，需要重新做逐词对齐再渲染。

## 素材来源与授权（发布前请看）

- App 画面：最新安装包 `Along-help-dial.apk` 内的页面，离线渲染截图；伙伴、评分、价格是 App 示例数据（片中右上角已标注）。
- 网站画面：本机网站分享包的记忆馆，本机离线录制。
- **外滩合照**（`public/img/bund-friends.png`，用户指定）：App 内注明为"用户提供的演示照片，不代表已获得商业使用许可"——公开发布前请确认授权。
- 动漫风外滩合照：网站包内由同一 AI 接口生成的图（`img/anime/`）。
- 地点/窗景照片：取自 APK，来源见网站包 `website/CREDITS.txt`。
- 世界地图：Natural Earth 110m（公共领域）。
- 字体：Noto Serif SC / Noto Sans SC / Source Serif 4（SIL OFL，`public/fonts/OFL-*.txt`）。
- 音效：Mixkit（免费商用，`public/sfx/ATTRIBUTION.md`）。
- 配音：Microsoft Edge 神经语音合成。
- 渲染引擎：[Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) 个人与小团队免费，公司可能需要付费许可。
- 市场数据：国家移民管理局 2026-10-20（Q3 免签入境 899.2 万人次 +24.1%、占 77.5%；入境前十客源国含韩、美、日）、2026-07（上半年外国人入境 2291 万人次 +20.4%）；新华社 2026-08-20（240 小时过境免签 57 国）；海报新闻 2026-08-11（欧洲暑期订单 +275%、#Chinamaxxing 40 亿+浏览）；国办发〔2024〕10 号；文化和旅游部 2026 年全国两会发言。
