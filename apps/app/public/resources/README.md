# 本地前端资源

页面、沙箱和导出 HTML 使用此目录，不在运行时访问第三方 CDN。

| 资源 | 版本 | 路径 |
| --- | --- | --- |
| Plus Jakarta Sans | Google Fonts v12，400/500/600/700 | fonts/plus-jakarta-sans/ |
| Three.js | 0.186.1 | libs/three/0.186.1/ |
| GSAP | 3.15.0 | libs/gsap/3.15.0/ |
| D3 | 7.9.0 | libs/d3/7.9.0/ |
| Chart.js | 4.5.1 | libs/chart.js/4.5.1/ |
| Mermaid | 11.12.2 | libs/mermaid/11.12.2/ |
| Tone.js | 14.8.49 | libs/tone/14.8.49/ |

`manifest.json` 记录下载来源、SHA-256 和文件大小；许可证随资源保存。
从仓库根目录执行 `python tools/download-frontend-resources.py` 可重新下载固定版本。
常规启动与构建不需要此下载步骤。Three.js 由 `prepare-three-modules.mjs`
从锁定的 npm 依赖复制，在 `dev` 和 `build` 开始时自动执行。

ESM 入口及其依赖、Mermaid 的动态模块、字体文件均已本地化。
沙箱用宿主绝对 URL 加载这些资源，`/resources/` 配置匿名 CORS。
新增库时先将资源及依赖加入本目录，再更新共享资源映射和生成提示词。
