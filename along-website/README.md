# Along 网站交付文档

## 项目概览

**项目名称**：Along 一起游官方网站  
**版本**：v1.0  
**完成日期**：2026年11月17日  
**设计理念**：基于 Along App 2.7.0 的"透过窗看中国"视觉语言，高级有质感的创意设计

---

## 核心功能

### 1. 首页 (`/`)

#### 开场动画
- **遮光板效果**：黑色遮光板覆盖全屏，营造仪式感
- **Logo 绘制动画**：基于矢量路径的笔画绘制动画（2.4秒）
- **自动上拉**：2.8秒后遮光板自动上拉，露出主页面

#### 天光背景系统
天光渐变跟随当地时间自动切换：
- **黎明** (5:30-7:00): `#F5D9C8 → #A8C8E1`
- **白天** (7:00-17:30): `#87CEEB → #E0F6FF`
- **黄昏** (17:30-19:00): `#FFB88C → #9B6B9E`
- **夜晚** (19:00-5:30): `#1A2332 → #0D1821`
- Logo 水印（右上角，透明度 0.065-0.085）
- 滚动时渐变角度微调（180° + scroll × 20°）

#### 舷窗轮播
- **窗形**：3:4 竖向舷窗（porthole）
- **场景数量**：6个（上海、南京地标）
- **切换动画**：6行切片交错滑出（每行延迟随机）
- **切换间隔**：5.2秒
- **信息显示**：地点名称（中英）+ 摄影师署名

#### 旅程三章
1. **落地** - 行程规划功能介绍
2. **同游** - 月洞门圆窗 + 地点照片
3. **带走** - 3D 文创预览（three.js 渲染旋转模型）

#### 技术特性
- 中英双语切换（localStorage 持久化）
- 响应式布局（桌面/平板/手机）
- 玻璃态组件（三种透明度层级）
- 深色模式适配

---

### 2. 记忆馆 (`/archive.html`)

#### 3D 场景
- **渲染引擎**：Three.js 0.170.0 + GLTFLoader
- **模型数量**：6个 3D 文创模型
- **布局**：空间阵列分布（保留原站形式，增加创意）
- **灯光**：环境光 + 两个方向光 + 柔和阴影

#### 交互功能
- **鼠标/触摸拖拽**：360° 旋转视角
- **滚轮/双指缩放**：60-200 单位距离
- **点击模型**：显示档案信息面板
- **控制按钮**：
  - 重置视角
  - 自动旋转开关

#### 档案系统
- **档案数量**：6份（鸡鸣寺、玄武湖、志愿者故事等）
- **详情弹窗**：中英双语内容
- **盖章收藏**：localStorage 本地存储
- **浮动动画**：模型微幅上下浮动 + 缓慢自转

---

## 设计系统

### 颜色
```css
--paper: #F7F2E8          /* 纸色底 */
--paper-content: #FFFDF8  /* 纸面内容色 */
--ink: #1B1813            /* 墨色 */
--seal: #B24A2C           /* 印泥红 */
--sage: #5F6F5A           /* 圣贤绿 */
```

### 玻璃系统
- **glass-thin**: `rgba(255,253,248, 0.72)` + 24px 模糊
- **glass-medium**: `rgba(255,253,248, 0.85)` + 24px 模糊
- **glass-thick**: `rgba(255,253,248, 0.92)` + 24px 模糊
- 边框：`rgba(27,24,19, 0.08)`

### 字体
- **中文标题**：思源宋体（Noto Serif SC Regular 400）
- **英文标题**：Source Serif 4（Variable 200-900）
- **正文**：系统字体栈

### 窗形
- **舷窗（porthole）**：3:4 竖向，圆角 24px
- **月洞门（moon-gate）**：1:1 正圆
- **取景框（frame）**：9:16 竖向，圆角 12px

---

## 技术架构

### 前端
- **框架**：原生 JavaScript ES 模块
- **3D 渲染**：Three.js 0.170.0
  - GLTFLoader
  - RoomEnvironment
  - RoundedBoxGeometry
  - BufferGeometryUtils
- **构建工具**：esbuild 0.28.2
- **包管理**：npm

### 文件结构
```
along-website/
├── public/
│   ├── index.html          # 首页
│   ├── archive.html        # 记忆馆
│   └── three.bundle.js     # Three.js 打包文件 (736KB)
├── assets/
│   ├── css/
│   │   ├── tokens.css      # 设计令牌
│   │   ├── reset.css       # CSS 重置
│   │   ├── typography.css  # 字体系统
│   │   ├── components.css  # 组件样式
│   │   ├── main.css        # 首页样式
│   │   └── archive.css     # 档案馆样式
│   ├── js/
│   │   ├── i18n.js         # 国际化
│   │   ├── sky.js          # 天光系统
│   │   ├── logo-animation.js
│   │   ├── window-carousel.js
│   │   ├── keepsake-preview.js
│   │   ├── archive-scene.js
│   │   ├── archive.js
│   │   └── main.js
│   ├── img/
│   │   ├── brand/          # Logo + 应用图标
│   │   ├── window/         # 6张舷窗场景照片
│   │   ├── places/         # 12张地点照片
│   │   └── keepsakes/      # (未使用)
│   ├── fonts/
│   │   ├── noto-serif-sc-regular.woff2 (5.6MB)
│   │   └── source-serif-4-latin.woff2
│   └── models/             # 6个 GLB 模型 (2.5-4.3MB each)
└── tools/
    ├── serve.mjs           # 本地预览服务器
    └── bundle-three.mjs    # Three.js 打包脚本
```

### 服务器
- **类型**：Node.js 原生 HTTP 服务器
- **端口**：55000（可配置）
- **限制**：仅绑定 127.0.0.1（loopback）
- **路由**：
  - `/` → `public/index.html`
  - `/assets/*` → `assets/*`
  - `/archive.html` → `public/archive.html`

---

## 素材清单

### 图片（20张）
- **舷窗场景**：6张 900×1200 jpg（来自 Unsplash）
  - 上海东方明珠（白天/夜晚）
  - 上海陆家嘴夜景
  - 南京玄武湖（桥/天际线）
  - 南京鸡鸣寺
- **地点照片**：12张（豫园、武康路、西岸、静安等）
- **Logo**：1张 PNG（透明底）
- **应用图标**：1张 PNG

### 3D 模型（6个 GLB）
1. `jiming-temple.glb` - 鸡鸣寺
2. `xuanwu-walk.glb` - 玄武湖漫步
3. `volunteer-lake.glb` - 志愿者湖边
4. `warm-company.glb` - 温暖陪伴
5. `company-photo.glb` - 陪伴照片
6. `corner-tower-keychain.glb` - 角楼钥匙扣

### 字体（2个 woff2）
- `noto-serif-sc-regular.woff2` (5.6MB)
- `source-serif-4-latin.woff2`

---

## 使用说明

### 安装依赖
```bash
cd along-website
npm install
```

### 构建
```bash
npm run build        # 构建 three.js + 字体子集
npm run build:three  # 仅构建 three.js
```

### 运行
```bash
npm run serve        # 启动预览服务器
# 或
npm run dev          # 构建 + 启动
```

访问 `http://localhost:55000`

---

## 浏览器兼容性

### 推荐浏览器
- Chrome 90+
- Edge 90+
- Safari 14+
- Firefox 88+

### 必需特性
- ES2020 模块
- CSS 自定义属性
- WebGL 1.0（Three.js）
- Backdrop filter（玻璃效果）
- CSS Grid & Flexbox

### 响应式断点
- 桌面：≥1024px
- 平板：768-1023px
- 手机：<768px

---

## 性能指标

### 首页
- **首屏资源**：~7.5MB
  - HTML: 6KB
  - CSS: 15KB
  - JS: 750KB (three.bundle.js)
  - 字体: 5.6MB
  - 图片: 1.2MB (首屏舷窗)
- **加载时间**：~2-3秒（本地）

### 记忆馆
- **额外资源**：~18MB (6个 GLB 模型)
- **帧率**：60fps（桌面）/ 30-60fps（移动端）
- **多边形数**：~50K triangles total

---

## 已知限制

1. **字体文件较大**（5.6MB）
   - 建议：使用字体子集工具优化
   
2. **3D 模型体积**（2.5-4.3MB each）
   - 建议：考虑按需加载或降低模型精度

3. **无服务端**
   - 盖章收藏仅存储在本地 localStorage
   - 建议：未来接入后端 API

4. **浏览器支持**
   - IE 11 及以下不支持
   - Safari 旧版本玻璃效果降级

---

## 未来优化建议

### 性能
1. 字体子集化（减少 80% 体积）
2. 3D 模型 LOD（按距离切换精度）
3. 图片懒加载
4. Service Worker 缓存

### 功能
1. 小游吉祥物动画（可选）
2. 更多档案内容
3. 搜索和筛选功能
4. 分享到社交媒体

### 体验
1. 加载进度条
2. 更丰富的微交互
3. 声音效果（可选）
4. 键盘导航支持

---

## 授权信息

### 照片来源
- **舷窗场景**：Unsplash（Unsplash License）
  - alan braeley, kimi lee, Lijian (Richard) Zhu,  
    Cheng Shi Song, 蔡 世宏, Nathan Wong
- **地点照片**：Unsplash（Unsplash License）
  - Bruna Santos, Erda Huang, Hat Trick,  
    Evgeny Matveev, Nikita Podolskii, William Ducret

### 开源组件
- **Three.js**: MIT License
- **字体**：
  - Noto Serif SC: SIL Open Font License 1.1
  - Source Serif 4: SIL Open Font License 1.1

---

## 联系方式

**项目团队**：Rank8848  
**方向**：AI + 社会公益  
**合作伙伴**：Insta360、百度地图、阿里云、Qoder

---

*生成日期：2026年11月17日*
