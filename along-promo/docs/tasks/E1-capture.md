# 任务 E1：截取 App 页面截图（旅行 App 产品介绍视频的素材）

给旅行 App「Along 一起游」的介绍视频截几张 App 页面截图。全部用中文报告。

## 环境
- 视频工程：仓库根目录下的 `along-promo`。
- App 的网页文件在 `capture/apk-web`（入口 `index.html`，hash 路由见 `js/router.js`，如 `#/trip` `#/stories` `#/studio` `#/support` `#/crafts`）。本地静态服务：`http://127.0.0.1:4191/index.html`；连不上就后台运行 `node capture\serve.mjs capture\apk-web 4191`。
- Python Playwright 已装。浏览器路径、启动参数、离线加载用的 `guard` 都在 `capture/vclock.py` 里（`launch(p)`、`ctx.route("**/*", guard)`），照抄即可。参考 `capture/recon.py` 的写法。
- 只截图，不改 `capture/apk-web` 里的文件。

## 截图设置
- `new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Shanghai")`，输出 780×1688 PNG。
- URL 加 `?sky=day`。init script 让页面时间从 2026-11-20 09:00（上海）开始（覆盖 `Date.now` 与无参 `new Date()`）。
- localStorage：`instrip.welcomed`='1'，`instrip.locale`='en'（文件名以 zh- 开头的用 'zh'），`instrip.settings`='{"assistant":true}'。
- 每张截图前等 `document.fonts.ready` + 600ms；画面里不要有提示条、焦点框、滚动条。

## 要截的图（覆盖 `public/apk/<名字>.png`）
1. `zh-trip`、`en-trip`：「行程」首页（舷窗东方明珠那屏）
2. `zh-assistant`、`en-assistant`：右下角小游助手面板打开后（问候 + 快捷按钮）；`en-assistant-translate`：在助手里输入"Please translate: 请带我去这个地址，谢谢"并发送后的界面
3. `en-trip-form`：落地表单填好（Shanghai，2026-11-21，10:00，3 天）；`en-trip-form-2`：第二步（兴趣选 Food / History / Photography 或表单里实际有的近似项）
4. `en-plan-day1` `en-plan-day2` `en-plan-day3`：生成后的行程详情各天，**整页长截图**（`full_page=True`），记下实际高度；有营业时间提醒（红字）的那天要拍到
5. `en-poi-yuyuan`：行程里豫园的地点弹层；`en-driver-card`：弹层里"给司机看"打开后的大字卡
6. `en-support`：帮助页
7. `en-lens-menu`：轻点底部中间圆形按钮弹出的四个选项；`en-stories`：故事页
8. `en-crafts-library`：`#/crafts` 页

## 清单
更新 `public/apk/manifest.json`（结构保持 `{screens:{name:{file,w,h,rects,placeholder}}, videos:{}}`）：你截的每张图 `w`=390、`h`=CSS 高度（长截图写实际高度）、`placeholder` 改 false。`rects` 写这些元素在截图里的 CSS 像素 `{x,y,w,h}`（`getBoundingClientRect()`，长截图加 scrollY）：
- en-trip：lens（底部中间按钮）、nav（底栏）
- en-trip-form：city、date、time、days、cta
- en-plan-day1/2/3：每个站点卡 `stop1..stopN`，以及其中的时间、交通、门票、花费、提醒（有就写，键名 `stop1-time` 这种）
- en-poi-yuyuan：photo、ticket、hours、directions、driver
- en-assistant / zh-assistant：sheet、chips、mic
其余图 rects 可以空。每做完一组就保存一次 manifest。

## 完成后
用 Read 工具逐张打开看一遍。最后用中文报告：每张图一句话说明画面、是否成功；rects 摘要；没做成的和原因；脚本路径（放 `capture/` 下）。
