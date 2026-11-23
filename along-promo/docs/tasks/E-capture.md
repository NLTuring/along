# 任务 E：采集 App 页面截图（产品宣传片素材）

为 Along 一起游的介绍视频截取 App 自己的页面画面。只截图，不改 App。全部用中文报告。

## 背景
- 视频工程：仓库根目录下的 `along-promo`。先读 `docs/design-spec.md`、`docs/storyboard.md`，了解每张截图在片中怎么用。
- App 是 WebView 应用，页面文件已从安装包解出到 `capture/apk-web`（入口 `index.html`，hash 路由见 `js/router.js`：`#/trip` `#/friends` `#/stories` `#/you` `#/guides/guide_jiajia` `#/checkout/<id>` `#/craft/<id>` `#/crafts` `#/make-order/<id>` `#/studio` `#/support`）。
- 本地静态服务：`http://127.0.0.1:4191/index.html`。连不上就后台启动 `node capture\serve.mjs capture\apk-web 4191`。
- 工具：Python Playwright 1.62，启动时用 `executable_path`（可留空，使用 Playwright 自带浏览器），参数 `--use-angle=d3d11 --ignore-gpu-blocklist`。参考现成脚本 `capture/recon.py`（本地网络白名单、localStorage 初始化）和 `capture/vclock.py`（逐帧录制用的虚拟时钟）。ffmpeg 在 PATH 里。

## 约定
- 截图只在本机进行：Playwright 的 route 只放行 127.0.0.1 / localhost，其余请求一律 abort（App 的线上服务 tokennext.top 不访问）。不在线上登录、下单、发帖。
- 不修改 `capture/apk-web` 里的文件；需要某个页面状态时，用 `add_init_script` / `page.evaluate`（可以 `await import('/js/xxx.js')` 调 App 自己的函数）或正常点按界面。
- 需要账号的页面用 App 自带的「临时体验账号」（我 → 用邮箱登录 → 使用临时体验账号，见 `js/login.js`、`js/local-experience.js`），它只在本机生效。

## 截图设置
- viewport 390×844，device_scale_factor=2（输出 780×1688），is_mobile=True，has_touch=True，timezone Asia/Shanghai。
- URL 加 `?sky=day`。用 init script 让页面时间从 2026-11-20 09:00（上海时间）起走（覆盖 `Date.now` 与无参 `new Date()`），日期与营业时间检查才一致。
- localStorage：`instrip.welcomed`='1'；`instrip.locale`='en'（文件名以 zh- 开头的用 'zh'）；`instrip.settings`='{"assistant":true}'（显示小游助手入口）。
- 示例行程：Shanghai，落地 2026-11-21 10:00，3 天，兴趣选 Food / History / Photography（以表单实际选项为准）。
- 每张截图前等 `document.fonts.ready` + 600ms；画面里不要有 toast、焦点框、滚动条、加载圈（除非本来就要拍这个状态）。

## 截图清单（覆盖 `public/apk/<名字>.png`，这些现在是占位图）
按顺序做，先完成的先给场景制作用：
1. `zh-trip`（中文「行程」首页，舷窗东方明珠）、`en-trip`（英文同页）
2. `zh-assistant`（中文，小游助手面板打开：问候 + 快捷按钮）、`en-assistant`（英文同状态）、`en-assistant-translate`（英文，在助手里问"帮我把'请带我去这个地址，谢谢'翻译成英文"之类的问题后的界面；App 本地如果答不了，就拍问题发出后的状态并在报告里说明）
3. `en-trip-form`（落地表单填好城市/日期/时间/天数）、`en-trip-form-2`（第二步：兴趣/节奏/预算）
4. `en-plan-day1` `en-plan-day2` `en-plan-day3`（生成后的计划详情，各天时间轴，**整页长截图**，记录实际页面高度；有营业时间/闭馆红色提醒的那天一定拍到）
5. `en-poi-yuyuan`（豫园地点弹层：照片、门票、开放时间、导航与"给司机看"按钮）、`en-driver-card`（给司机看的全屏大字中文地名卡）
6. `en-friends`（伙伴列表）、`en-guide-jiajia` `en-guide-zhangmin` `en-guide-junjie`（三位伙伴详情）、`en-checkout`（结算票面）、`en-booked`（预约成功、有状态印章；可用 App 的"代向导确认（演示）"按钮推进）、`en-support`（求助页）
7. `en-lens-menu`（轻点底部中间取景键弹出的四个选项）、`en-stories`（故事流）、`en-post-bund`（发故事面板，已选外滩合照 `along-shanghai-friends`，配文带 #话题，不提交）、`en-share-bund`（分享弹层：拍立得卡 + Open TikTok）
8. `en-craft-real`（3D 文创页：照片=外滩合照，产品=冰箱贴，真实风格，3D 模型可见）、`en-craft-anime`（同一件切到动漫风格，见下）、`en-craft-hold`（在模型上长按、进度环走到一半）、`en-make-order`（制作与邮寄表单，地址用虚构示例，不提交）、`en-crafts-library`（我的文创库）

动漫风格：这张照片的动漫版已经由同一个 AI 服务生成好，放在 `public/img/anime/along-shanghai-friends.webp`。App 会把每种风格的图片存在本机缓存里（看 `js/page-craft.js` 的 `cacheVariant` / `getCachedVariant` / `variantCacheKey` 和 `js/crafts.js`）。用 App 自己的这些函数把这张图存成 ANIME 版本，再点 App 的「动漫」按钮让 App 自己显示它。1 小时内做不出来就只交真实风格，报告里说明原因。

## 两段短视频（虚拟时钟逐帧录，30fps，方法见 `capture/vclock.py`）
- `public/apk/craft-orbit-real.mp4`、`public/apk/craft-orbit-anime.mp4`：文创页里 3D 冰箱贴被拖动缓慢转一圈多，约 5 秒，780×1688，H.264 `-crf 16 -pix_fmt yuv420p`。动漫那段做不出来就跳过。

## 清单
更新 `public/apk/manifest.json`，保持结构 `{screens:{name:{file,w,h,rects,placeholder}}, videos:{name:{file,w,h,frames}}}`：`w`=390，`h`=该图 CSS 高度（长截图写实际高度），`placeholder` 改为 false。`rects` 写片中要标注的元素在截图坐标（CSS px）里的 `{x,y,w,h}`，至少：
- en-trip-form：city、date、time、days、cta
- en-plan-day1/2/3：每个站点卡 `stop1..stopN` 及其 time / transport / ticket / cost / warning（有就写）、day tabs
- en-poi-yuyuan：photo、ticket、hours、directions、driver
- en-friends：card1..card3；en-checkout：ticket、price；en-booked：stamp
- en-assistant / zh-assistant：sheet、chips、mic
- en-trip：lens（底部中间取景键）、nav
- en-craft-real：model、style-real、style-anime、hold
- en-share-bund：polaroid、tiktok
用 `getBoundingClientRect()` 取（长截图加 scrollY）。每完成一组就保存一次 manifest，方便别人先用。

## 完成后
用 Read 工具逐张打开检查。最后一条消息用中文报告：每张截图一句话说明画面 + 是否成功；manifest 关键 rects 摘要；没做成的项和原因；采集脚本路径（放在 `capture/` 下，可重跑）。
