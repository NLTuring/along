# Along 一起游

面向来华外国游客的旅行陪伴 App：**落地有人接，同游有朋友，回国带得走**。

Along 由团队共同开发。本仓库包含手机端 Web 应用、Node.js 服务端、管理端、部署配置、产品文档与视觉物料。

> 工程可以本地运行和容器部署，不代表已经正式上线。线上域名、邮箱、地图、AI 与云存储均需按 [`deploy/README.md`](deploy/README.md) 和 [`server/.env.example`](server/.env.example) 另行配置；未配置的功能会明确显示不可用。

## 功能

- **行程 Trip**：输入落地时间、城市、天数与偏好，生成 3/5/7 天行程；天色跟随目的地当地时间；时间轴、交通、雨天备选、费用合计与营业时间检查。
- **伙伴 Friends**：本地志愿者与持证向导两类身份，按城市、类型、兴趣筛选；详情、可约时段、预约状态机与安全说明。
- **故事 Stories**：社区发帖、审核、点赞与删除；示例内容只读，不混入用户帖子。
- **文创 Craft**：照片生成人物浮雕冰箱贴 / 钥匙扣，支持手动涂抹人物凸起、正背面查看、GLB/STL 导出；配置可信服务后可切换 AI 动漫风格。
- **小游助手**：行程与地点问答、语音输入、快捷指令。
- **适老与双语**：适老版三项导航、大字号、减少动态与降低透明度；中英文界面。
- **管理端**：社区审核、制作询价、运营资料与订单状态。
- **服务端**：邮箱验证码登录、共享社区、视频上传转码、私有对象存储、AI 编辑/分割链路（默认关闭）、百度地图与坐标转换。

## 目录

| 路径 | 内容 |
|---|---|
| `mobile/` | 手机端 Web 应用与本地预览/检查/打包工具 |
| `server/` | Fastify + TypeScript 服务端、迁移、测试与本地开发模式 |
| `admin/` | 管理端页面 |
| `deploy/` | Docker Compose、Dockerfile、nginx 与生产环境模板 |
| `docs/` | 产品介绍、前后端接口约定、PPT 素材 |
| `tools/` | 部署、验收、探针与资源校验脚本 |
| `一起游-手机端设计方案/` | 视觉系统、信息架构、页面与动效设计文档 |
| `along-website/` | 官网与 3D 记忆馆（原生 JS + Three.js） |
| `along-banner/` | 团队横幅设计工程 |
| `along-poster/` | 视觉海报设计工程 |
| `along-promo/` | 产品介绍视频工程（Remotion） |

各子工程的使用说明见对应目录的 `README.md`。

## 本地运行

要求 Node.js 24+；视频转码需要 `ffmpeg` 和 `ffprobe` 在 `PATH` 中。

```bash
npm ci
npm run build:3d
npm --prefix server ci
npm --prefix server run dev:local
node mobile/tools/serve.mjs 4175
```

- 手机端：<http://localhost:4175>
- 管理端：<http://localhost:4175/admin/>
- `dev:local` 使用内存数据库与本机私有文件目录，重启会清空开发数据，仅用于开发；该模式允许在页面显示验证码，不会发送真实邮件。

## 测试与检查

```bash
npm test                      # 手机端与工具链 Node 测试
npm --prefix server test      # 服务端测试
npm --prefix server run typecheck
node mobile/tools/check.mjs   # 中英文案、脚本 key、相对导入检查
```

手机端与服务端的验收记录见 [`mobile/ONLINE-ACCEPTANCE.md`](mobile/ONLINE-ACCEPTANCE.md) 和 [`mobile/ACCEPTANCE.md`](mobile/ACCEPTANCE.md)。

## 配置与安全

- 复制 `server/.env.example` 为 `server/.env`，或在目标服务器使用 `deploy/production.env.example`。模板中没有任何真实凭据。
- 默认 `AI_PROVIDER=disabled`。只有完整的图片编辑服务、支持真人与动漫的分割服务、精确域名白名单和用户同意流程都配置完成后，AI 才会报告可用。
- 不要提交 `.env`、数据库/Redis 密码、S3 密钥、百度 AK、SMTP 授权码、签名密钥或 APK。仓库的 `.gitignore` 已排除这些路径。
- 生产环境不得开启 `DEVELOPMENT_LOCAL` 或 `DEV_OTP_DISPLAY`。

## 视觉工程

```bash
# 官网
cd along-website && npm ci && npm run build && npm run serve   # http://localhost:55000

# 介绍视频
cd along-promo && npm ci && npm run dev                       # Remotion Studio
cd along-promo && npm run render                              # 输出到 along-promo/out

# 海报 / 横幅
# 直接用浏览器打开 along-poster/poster-v6.html 或 along-banner/banner.html；
# 高质量导出脚本在各自 tools/ 下，依赖 Python + Playwright。
```

设计稿与分镜说明在 `along-promo/docs/`、`along-poster/` 和 `along-banner/` 内。

## 素材与许可

- 字体：Source Serif 4、Noto Serif SC、Noto Sans SC，均遵循 SIL Open Font License；许可文本随字体目录分发。
- 照片：Unsplash 与 Wikimedia Commons（CC BY / CC BY-SA / CC0）等来源，署名与许可见 `mobile/assets/img/credits.json`、`along-website/README.md` 与各设计工程内的 `CREDITS` 文件。
- 演示图：`mobile/assets/img/along-samples/` 内的图片由团队提供，仅用于产品演示。公开仓库中的 `along-lanterns.png` 已替换为中性占位图，原始演示照片未包含。
- 设计工程中的历史截图可能仍包含早期演示素材；对外复用前请确认肖像权与图片授权。
- 代码与产品内容的版权归团队所有；第三方组件与素材遵循各自许可。

## 已知边界

- 行程、预约、支付、短文与文创中的示例数据仅用于演示，不构成真实服务承诺。
- AI 图片编辑、动漫风格与人物分割依赖外部服务；未配置时会明确失败，不会生成替代图或假遮罩。
- GLB 含纹理，STL 仅含几何；可打印性仍需按具体材料与工艺确认。
- 安卓真机、WebView、百度地图原生能力与生产部署仍需在目标环境验收。
