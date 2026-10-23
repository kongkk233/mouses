# 浏览器性能验收

此入口单独构建至被忽略的 `artifacts/qa-build`，不进入生产 `dist`，也不修改生产数据库。

```sh
DATA_DIR=artifacts/performance-20 node --import tsx qa/seed-performance.ts 20 100
npx vite build --config qa/vite.config.ts
DATA_DIR=artifacts/performance-20 PORT=3004 APP_ORIGIN=http://127.0.0.1:5174 NODE_ENV=production npm start
# 另一个终端：
npx vite preview --config qa/vite.config.ts
```

打开 `http://127.0.0.1:5174/qa/performance.html`，保持前台，在实际鼠笼视图开始采样；手动搜索和切换视图，面板记录事件至第二个动画帧的时间、实际渲染卡片 / 行数、活跃场景上限。切换到 200 笼 / 1,000 鼠时使用新的目录生成数据并重启本地 API。

首个可操作时刻从本次导航起计，包含本地 API 加载与首次 React 提交。动效采样记录 8 秒 requestAnimationFrame 节奏与 P95 帧间隔，反映主线程帧预算，不等同于 GPU 最终呈现帧率；记录设备、视口和网络条件，不外推到 iPhone。交互数据只记录搜索 / 视图动作种类和耗时，不保存关键词或真实资料。
