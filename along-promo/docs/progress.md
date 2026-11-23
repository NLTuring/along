# 制作进度（制作 Agent 自用）

- 2026-11-18 08:50：场景子 Agent B / C1 / C2 / E 均被模型内容安全过滤拦截（输出被拦），重试同样失败；改为制作 Agent 自己完成。D（S08–S11）已完成并通过自检。
- 已完成：设计 spec、分镜、时间轴（`src/timeline.ts`，2700f）、地基组件（Phone3D / Mascot2D / LogoInk / Paper / Overlays）、旁白 10 条（`public/vo`，已响度归一 -16 LUFS，原始在 `public/vo/raw`）、网站记忆馆录帧（`public/web`，`capture/capture_museum.py`）、S08–S11（D）、workbench 清单（`src/workbench.ts`）、SFX 素材复制到 `public/sfx` + 峰值表 `docs/sfx-peaks.txt`。
- 已改：S07 z=3（S07 在 S08 上层）。

## 待做（按顺序）
1. ✅ APK 截图完成（09:40）：`capture/capture_apk.py`，33 张真实页面 + manifest rects。要点：翻译提问离线答不了 → 用本机指令「切换成英文」（zh-assistant-cmd → en-assistant-translate）；故事流用 Examples（en-stories / en-story-bund）；分享面板 en-share-bund（拍立得 + Open TikTok）；文创 real/hold/anime/step3/step4 都是 App 自己渲染（动漫图写进 App 本机缓存）；make-order 需服务器，画面是「需要配置服务器」提示，片中不用，邮寄用 step4「Take it home」+ 手绘包裹。plan：day1 外滩/豫园 09:30 ¥40 walk 12 min…；day2 南京博物院 Closed on this day（stop1-warning）。
2. S00–S02 ✅、S03–S05 ✅（共享：`src/scenes/phone/kit.tsx` rig.ts map.tsx；S01 点阵图 `src/scenes/S01/dotmap.ts` 由 tools/make_dotmap.py 生成）；S06–S07 进行中。小改用 `tools/apply_patch.py <json>`。
3. ✅ SFX 钉帧表 `src/sfx.ts`；音画同步实测（`tools/check_sfx_sync.py`，无旁白音轨 `--props=props-novo.json`）：6 个尖锐音效误差 −1.4…+0.3 帧。
4. ✅ v1/v2 全片渲染（v2 = `out/along-promo-v2.mp4`，峰值 −2.2 dB）；审片帧 `out/review/`（tools/review_frames.py）；独立终检进行中（任务 `docs/tasks/review.md`）→ 修复 → 终渲 `out/along-promo.mp4`。
5. ✅ 独立终检（v2）→ 3 项必须改 + 若干建议已修 → v3 = 终版 `out/along-promo.mp4`（90.0s，-16.9 LUFS，峰值 -3.4 dBFS；T8 接缝亮度跳变 81.6→1.3）。
   工作台：本机无创建符号链接权限，`open.mjs` 失败；已用目录联接（mklink /J）把 workbench/proj、public/* 指向本工程，直接起 vite（5198），`?import=project` 导入成功、0 报错。
