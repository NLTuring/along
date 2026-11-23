# Along 一起游 · 团队横幅工程

2500 × 1000 CSS px（1 px = 0.4 mm）的团队横幅设计稿。

## 结构

| 路径 | 内容 |
|---|---|
| `banner.html` | 横幅设计稿，可直接用浏览器打开预览 |
| `assets/` | 字体、Logo、背景、二维码、吉祥物 SVG |
| `tools/` | 素材处理与高质量导出脚本（Python + Playwright / OpenCV） |
| `out/` | 渲染输出（不提交） |
| `work/` | 中间检查图（不提交） |

## 渲染

```bash
# 需要 Python、OpenCV、Pillow、Playwright
python tools/render.py
```

## 素材说明

原始活动主视觉不在本仓库中，`tools/prep_banner.py`、`inspect_kv.py`、`measure_kv.py` 和 `texture_period.py` 需要本地提供该文件。通过环境变量 `ALONG_KV` 指向本地路径即可：

```bat
set ALONG_KV=D:\path\to\kv.png
python tools/prep_banner.py
```

横幅本身使用的字体、Logo、背景与图形均已随 `assets/` 提供，打开 `banner.html` 不需要该主视觉。
