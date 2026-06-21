# 数字人直播 · 交付 Demo（生产标准）

面向产品 / 运营 / 研发的数字人直播原型演示，按**生产标准**打通全链路：

```
数智人云渲染 ──①拉流──▶ 专业 OBS（抠像 / 虚拟背景 / 装修）──②推流──▶ TRTC 直播间 ──▶ 真实观众
                                                                          ▲
                              评论真走腾讯 IM ◀── 观众发评论          播控台：模型回复→编辑→播报
                                       │
                              播控台：撤回 / 禁言 / 多管理员协作
```

四类页面：**管理台**（建房、分发链接）→ **评论播控台**（评论审阅 + 模型回复 + 播报 + 撤回/禁言 + OBS 地址）→ **观众端**（手机看播 + 发评论）→ **监控**（只读）。

## 链路总览（生产模式）

1. 管理台创建直播间，得到字符串房间号 `liveId`（同时作为 TRTC 房间号与 IM 群 ID）。
2. 播控台点「开始直播」：服务端创建数智人 **rtmp 协议会话**，产出一条**拉流地址**（`PlayStreamAddr`）；并生成把画面推回直播间的 **RTMP 推流地址**（`rtmp://rtmp.rtc.qq.com/push/{liveId}?...`）。
3. 你的专业 **OBS**：拉「拉流地址」→ 抠像 / 虚拟背景 / 装修贴图 → 推「推流地址」。
4. 真实观众打开 `观众链接 /live/:liveId`（手机浏览器），用原生 `trtc-sdk-v5` 进同一字符串房间，即可看到 OBS 合成后的画面。
5. 观众发评论 → 真走腾讯 **IM 群**；播控台拉取评论，点「模型回复」生成话术，二次编辑后「播报」驱动数智人；可对评论「撤回」（IM 撤回）、对发送者「禁言」（IM 禁言）。

> 数智人也可输出透明背景；OBS 侧做抠像与虚拟背景替换。若暂不接 OBS，可在播控台改用 `mode=direct` 直连模式快速验证数智人说话（数智人直接进 TRTC 房间）。

## 快速开始

1. **环境变量**

   ```bash
   cp .env.example .env
   ```

   必填：`TRTC_SDK_APP_ID`、`TRTC_SECRET_KEY`、`IVH_APP_KEY`、`IVH_ACCESS_TOKEN`、`IVH_VIRTUALMAN_PROJECT_ID`、`IM_REST_ADMIN_USER_ID`（App 管理员，评论链路 + 撤回/禁言所需）。
   前端展示：`VITE_TRTC_SDK_APP_ID`（与 SDKAppID 相同数字）。

   控制台需开启：TRTC「输入媒体流进房」（RTMP 推流回房）、TUILiveKit、即时通信 IM、数智人 aPaaS。

2. **启动**

   ```bash
   npm install
   npm run dev
   ```

3. **演示流程**

   | 步骤 | URL | 操作 |
   |------|-----|------|
   | 管理台 | `/admin` | 创建直播间；复制观众链接与管理员 A/B 链接 |
   | 播控台 | `/studio/:roomId?mod=a` | 开始直播 → 复制 OBS 拉流/推流地址 → 评论模型回复→编辑→播报；撤回/禁言 |
   | 观众端 | `/live/:liveId` | 手机看播 + 发评论 |
   | 监控 | `/monitor/:roomId` | 只读观看 |

4. **健康检查**

   ```bash
   curl -s http://127.0.0.1:3001/api/health
   ```

   关注 `ivhConfigured`、`tuiLiveRestConfigured` 应为 `true`。

## 主路由

| 路径 | 说明 |
|------|------|
| `/` | 重定向至 `/admin` |
| `/admin` | 管理台：房间 CRUD + 链接分发 |
| `/studio/:roomId?mod=a\|b` | 评论播控台（三区：评论 / 编辑 / 预览+OBS 地址）|
| `/live/:liveId` | 观众端（移动优先，看播 + 评论）|
| `/monitor/:roomId` | 监控页：只读 TRTC 预览 |

## 默认 API

```
GET  /api/health
GET  /api/rooms            GET /api/rooms?liveId=
POST /api/rooms            GET/DELETE /api/rooms/:id
POST /api/rooms/:id/token  # role=anchor|moderator(slot=a|b)|monitor|preview|audience

POST /api/rooms/:id/studio/start   # body: { mode: 'production'|'direct' }
POST /api/rooms/:id/studio/stop
GET  /api/rooms/:id/studio/session
GET  /api/rooms/:id/studio/obs-endpoints

GET  /api/rooms/:id/studio/comments
POST /api/rooms/:id/studio/comments          # 观众/注入：真走 IM
GET  /api/rooms/:id/comments/public          # 观众端公开评论流
PATCH /api/rooms/:id/studio/comments/:cid    # 编辑回复草稿
POST /api/rooms/:id/studio/comments/:cid/claim          # 多管理员认领锁
POST /api/rooms/:id/studio/comments/:cid/generate-reply # 模型回复
POST /api/rooms/:id/studio/comments/:cid/broadcast      # 播报
POST /api/rooms/:id/studio/comments/:cid/recall         # 撤回（IM）
POST /api/rooms/:id/studio/comments/:cid/mute           # 禁言（IM）
```

历史端点（旧 IM、presubmit、`digital-human/jobs` 等）见 `server/archive/legacyRoutes.mjs`，设置 `ARCHIVE_LEGACY=1` 后启用。

## 文档

- [OBS 拉流转推管线](docs/obs-pull-push-pipeline.md)
- [IM 评论链路与撤回 / 禁言 / 多管理员](docs/im-comment-moderation.md)
- [数智人 TRTC / aPaaS 集成说明](docs/trtc-ivh-integration.md)
- [腾讯云直播管理后台可见性](docs/tuilive-manager-integration.md)
- [架构与决策（第一性原理）](progress.md)

## 归档代码

点赞 Demo、观众 H5 旧版、Canvas 开播、TUILiveKit `startLive` 封装等已移至 `archive/`，说明见 [archive/README.md](archive/README.md)。

## 构建 / 自检

```bash
npm run build
node --check server/index.mjs
```
