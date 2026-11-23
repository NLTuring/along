# Along 上线与运行手册

本项目新增百度地图、真实社区、AI 图片处理/人物分割、GLB/STL 文创和人工制作询价。**工程可部署不等于已正式上线。** 采用 **`https://tokennext.top/along/`**，保留现有首页及其他项目，不再要求新增子域名或证书。

2026-11-15 已部署到 `/opt/along`（`tools/deploy-along.mjs` 分阶段执行），nginx 仅在 `tokennext.top` HTTPS 块内加了一行 include，原配置备份在 `/opt/along/backups/`。服务器无法访问 Docker Hub，基础镜像经腾讯云镜像拉取后本地打标签，Debian 软件源通过 `DEBIAN_MIRROR` 构建参数使用腾讯云镜像，均未修改全局 Docker 配置。真机邮箱登录和运营资料仍待验收。

## 当前确认的同域名部署

- APK 后台基址：`https://tokennext.top/along`，接口从 `/along/api/` 转发到独立 Along 服务的 `/api/`。
- 网页：`https://tokennext.top/along/`；管理端：`https://tokennext.top/along/admin/`。这些是目标地址，不代表已经上线。
- 环境变量：`APP_ORIGINS=https://tokennext.top,https://appassets.androidplatform.net`，`PUBLIC_BASE_PATH=/along`。
- nginx配置片段为 `deploy/along-host.nginx.conf`，只能加到现有 `tokennext.top` 的HTTPS服务块中，不能覆盖原站点、根路径或证书。修改前备份，执行 `nginx -t` 成功后才平滑重载。
- Along独立Web端口为 `127.0.0.1:4338`，采用 `compose.yaml` 与 `compose.single-host.yaml`；数据库、队列及私有文件持久化且不公开端口。
- 同域名子路径不是浏览器同源安全隔离；两套网站应均可信。Along Cookie采用独立名称和 `/along/` 路径，并保留CSRF/服务端权限校验。
- 发件服务请在 `.android-local/smtp-deployment.env` 本机填写，专用授权码不要贴入聊天。`tools/stage-along-config.mjs` 在缺必填项时拒绝生成生产配置。
- 当前指定模型只实测通过主角框/近似轮廓，图片编辑503；`openai-person`模式仅开放待复核的人物建议，不冒充动漫图片生成。已完成三次授权调用，不追加调用。

## 1. 本地开发

要求 Node.js 24+；视频处理需 `ffmpeg` 和 `ffprobe` 在 PATH。

```text
npm ci
npm run build:3d
npm --prefix server ci
```

在两个终端运行：

```text
npm --prefix server run dev:local
node mobile/tools/serve.mjs 4175
```

- 手机端：`http://localhost:4175`
- 管理端：`http://localhost:4175/admin/`
- API 只监听本机 3001，由预览服务同源转发。
- `dev:local` 是显式开发环境，使用内存数据库及本机私人文件目录；重启会丢失开发数据库，不适合正式使用。
- 仅这个开发模式允许在页面显示验证码，不发送真实邮件。需要管理端测试时在本机终端设置 `ADMIN_EMAILS=along-admin@example.test`，不得使用真实人员的邮箱冒充账号。
- 启动脚本不配置 AI/地图凭据，不把测试图片发送到外部服务。缺凭据的地图或 AI 功能必须明确显示不可用。
- 旧 4173 预览端口数据与 4175 隔离；不得为了测试清空用户旧照片或浏览器存储。

## 2. 配置和生产依赖

AI 图片编辑已实现官方 DashScope 同步协议，可配置境内地域和明确的模型名称。**人物分割仍需另行提供可信服务，且须同时支持真人和动漫人物**；官方 SegmentBody 的真人分割能力不能冒充动漫分割。只有两段服务、凭据和精确域名白名单均配置齐全，才会报告 AI 可用。默认 `AI_PROVIDER=disabled`；当前未进行真实模型调用或效果验收。

完整后台变量以 `server/.env.example` 为准；生产模板为 `deploy/production.env.example`。

| 必要资源 | 用途/安全边界 |
|---|---|
| 大陆服务器与域名、HTTPS | 准备备案及上线所需手续；`APP_ORIGINS` 仅填正式 HTTPS 源，不使用通配符 |
| PostgreSQL | 持久存储身份、社区、任务、作品版本和订单 |
| Redis | 持久任务队列及处理状态；启用密码，不暴露公网 |
| 私有 OSS/S3 兼容桶 | 原图、模型、收货相关材料均不得公开；应用鉴权后转发，拒绝匿名桶访问 |
| SMTP 邮件服务 | 真实邮箱验证码；生产不得显示验证码 |
| 百度地图浏览器 AK、服务端 AK | 浏览器 AK 域名限制；服务端 AK 保密；地图/路线/坐标转换均按百度接口要求 |
| 境内图像编辑与分割服务 | 确认模型地域、授权、费用和隐私规则；每次处理有用户同意和额度限制 |
| 管理员与制作团队 | 明确审核、报价、处理时效和收货信息访问权限 |

开发与生产完全分离。`DEVELOPMENT_LOCAL` 和 `DEV_OTP_DISPLAY` 绝不可在生产开启。不要将 `.env`、真实密码、AK/SK、签名材料放入源码或对话。

## 3. 容器部署步骤

本机尚未检测到 Docker，因此下面是待目标环境验证的部署步骤，不是已成功执行记录。

1. 在目标服务器复制模板为 `deploy/production.env`，填写真实参数，并设置仅部署账号可读。
2. 为数据库/Redis 生成独立随机密码，为 `SESSION_SECRET` 生成至少 32 字符随机值。Compose 中 URI 密码使用十六进制/URL-safe 值，或正确编码特殊字符。
3. 使用 `.dockerignore` 排除本地密钥、原 APK、解包内容、下载目录和运行数据；构建时不得上传整个工作区到第三方构建服务。
4. 在目标环境执行：

```text
docker compose --env-file deploy/production.env -f deploy/compose.yaml build
docker compose --env-file deploy/production.env -f deploy/compose.yaml up -d database redis
docker compose --env-file deploy/production.env -f deploy/compose.yaml run --rm api node dist/migrate.js
docker compose --env-file deploy/production.env -f deploy/compose.yaml up -d api worker web
```

5. Web 层仅绑定 `127.0.0.1:8080`。在主机 TLS 网关转发正式域名到该端口；勿把内部 HTTP 端口直接用于生产登录。
6. 保留浏览器 `Origin` 与 `X-CSRF-Token` 头；不要为方便联调关闭服务端 Origin/CSRF 校验。API、数据库和 Redis 不发布公网端口。
7. 检查 `/api/config` 无私密凭据，生产不会返回开发验证码；普通账号无法访问 `/api/admin/*`。
8. 验证真实邮件、百度地图、授权测试图的模型调用及视频转码，检查费用与失败恢复后再开放注册。

镜像中包含 FFmpeg、固定锁文件安装和编译后的服务；Web 产物包含本地 Three.js bundle，不依赖国外 CDN。首次构建、迁移及生产配置尚需在部署服务器实测。

## 4. 上线前必须通过

- 运行原有及新增测试、服务端类型检查、构建和双语检查。
- 两个独立用户、一个管理账号验证发布—待审核—审核通过—他人可见；未审核内容、私人模型及地址不可越权。
- 上传实际视频并等待转码完成，验证封面、播放与 Range 请求；异常输入有大小/格式/时长和超时限制。
- 百度定位权限拒绝、坐标转换、路线以及 App/网页回退真实验证；不得把“我的位置”文字当作获取到了 GPS。
- AI 用已授权测试照片验证原图保留、动漫化、分割对齐、错误/超时/取消/重复提交及费用上限。五秒只是手势确认，不承诺五秒生成。
- GLB 可被标准工具解析并显示纹理，STL 可被切片工具读取；单位和外形尺寸一致，人物凸起真实，网格封闭。可打印性仍需具体材料工艺审核。
- 询价冻结模型版本；最新报价确认后才开始制作；修改客户端价格或状态不能影响服务端订单。收货地址仅制作权限可见，不出现在日志和公开内容。
- 正式隐私告知、用户协议、内容规则、举报处理、作品授权/肖像权、数据保留/删除和制作售后政策由运营确认。

## 5. 备份与回滚

- 数据库按部署账号权限进行 `pg_dump`，备份加密并与生产数据隔离；定期在空库验证恢复。
- 对象存储启用版本管理和生命周期，不允许私有原图长期无上限保留；删除任务需保护已冻结制作订单的合法记录。
- Redis 使用 AOF 和持久卷；恢复时检查任务幂等键，避免重复生成和重复制作。
- 发布前备份数据库并记录镜像摘要。先部署兼容性迁移，再升级 API/Worker/Web；失败时回滚镜像，不能盲目逆向破坏性数据库迁移。
- 不使用 `docker compose down -v` 作为升级步骤，它会删除数据库/队列持久卷。

## 6. 当前明确边界

- 未购买或开通任何云资源，未正式部署；百度和 AI 的真实服务联调需凭据。
- 模型是照片人物浮雕，不是单张图精确重建完整人物背面。
- GLB 包含纹理；STL 只包含几何。单色打印不能自动打印照片颜色，彩色工艺必须人工确认。
- 首版询价无在线支付；发货状态须由工作人员真实录入，不代表自动调用了快递物流。
- 旧 APK 仅替换 Web 层的打包方式不能证明支持 GLB/STL 原生保存；真机/Android WebView 另行验证，不覆盖原包和签名。
