# 数字人直播 · 交付 Demo

面向开发 / 产品经理的可控后台数字人直播演示：**管理台 → 播控 → 监控** 三条主路径。

## 快速开始（约 5 分钟）

1. **环境变量**

   ```bash
   cp .env.example .env
   ```

   必填：`TRTC_SDK_APP_ID`、`TRTC_SECRET_KEY`、`IVH_APP_KEY`、`IVH_ACCESS_TOKEN`、`IVH_VIRTUALMAN_PROJECT_ID`  
   前端展示：`VITE_TRTC_SDK_APP_ID`（与 SDKAppID 相同数字）

   可选 LLM：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（不设则使用占位回复文案）

   **勿设置** `IVH_AUTO_CLOSE_SESSION=1`（除非联调省并发），否则数智人会话会立即关闭。

2. **启动**

   ```bash
   npm install
   npm run dev
   ```

   浏览器打开 Vite 提示的地址（通常 `http://127.0.0.1:5173`）。

3. **演示流程**

   | 步骤 | URL | 操作 |
   |------|-----|------|
   | 管理台 | `/admin` | 创建直播间 |
   | 播控 | `/studio/:roomId` | 开始直播 → 注入评论 → 生成回复 → 编辑 → 播报 |
   | 监控 | `/monitor/:roomId` | 新窗口只读观看同一 `liveId` 数字人画面 |

4. **健康检查**

   ```bash
   curl -s http://127.0.0.1:3001/api/health
   ```

   关注 `ivhConfigured` 应为 `true`。

## 主路由

| 路径 | 说明 |
|------|------|
| `/` | 重定向至 `/admin` |
| `/admin` | 管理台：房间 CRUD |
| `/studio/:roomId` | 播控台：评论 → 生成回复 → 播报 |
| `/monitor/:roomId` | 监控页：只读 TRTC 预览 |

## 默认 API（交付 Demo）

```
GET  /api/health
GET  /api/rooms
POST /api/rooms
GET  /api/rooms/:id
DELETE /api/rooms/:id
POST /api/rooms/:id/token

POST /api/rooms/:id/studio/start
POST /api/rooms/:id/studio/stop
GET  /api/rooms/:id/studio/session

GET  /api/rooms/:id/studio/comments
POST /api/rooms/:id/studio/comments
PATCH /api/rooms/:id/studio/comments/:commentId
POST /api/rooms/:id/studio/comments/:commentId/generate-reply
POST /api/rooms/:id/studio/comments/:commentId/broadcast
```

历史端点（IM、presubmit、`digital-human/jobs` 等）见 `server/archive/legacyRoutes.mjs`，设置 `ARCHIVE_LEGACY=1` 后启用。

## 归档代码

点赞 Demo、观众 H5、Canvas 开播、TUILiveKit 调试面板等已移至 `archive/`，说明见 [archive/README.md](archive/README.md)。

## 文档

- [交付路线图](docs/delivery-demo-roadmap.md)
- [演示脚本](docs/delivery-demo-script.md)（Phase E）
- [数智人 TRTC 集成说明](docs/trtc-ivh-integration.md)

## 构建

```bash
npm run build
node --check server/index.mjs
```
