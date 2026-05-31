# 数字人直播交付 Demo — 下一步优化任务清单（AI Coding 用）

> 基于当前 `main` 分支现状与对话进展整理。目标：面向**开发 / 产品经理**的可控、可演示后台数字人直播 Demo；**暂不要求观众端先审后发**；延迟非首要指标，**流程可控**优先。

---

## 0. 当前基线（已实现，勿重复造轮子）

| 能力 | 位置 | 说明 |
|------|------|------|
| 房间 CRUD | `server/index.mjs` + `AdminRooms.vue` | `POST/GET /api/rooms` |
| 数智人 aPaaS TRTC 进房 | `server/ivhApaas.mjs` + `ivhPipeline.mjs` | `createsession → startsession → SEND_TEXT` |
| 会话默认保持 | `ivhPipeline.mjs` | 未设 `IVH_AUTO_CLOSE_SESSION=1` 时不 `closesession` |
| 同会话多轮播报 | `POST .../digital-human/speak` | 需 `image_done` + 仍有 `ivhSessionId` |
| 手动结束会话 | `POST .../digital-human/stop-session` | `closeRoomIvhSession` |
| 管理端预览画面 | `AnchorBroadcast.vue` + `useTrtcStage.js` | 原生 `trtc-sdk-v5` 订阅远端 |
| 评论入队（可选） | `POST .../audience/pending-comments` | 内存队列；观众页可提交 |
| 待审 → 直接送数智人 | `job-from-pending` | **无 LLM 中间态**，一键整句驱动 |

**缺口（相对你的交付需求）**：

1. 无「评论 → **生成回复文案** → 人工改 → **再播报**」三步 UI/API。
2. 无真实或可切换的 **LLM 回复生成**（仅有占位 `llm_done` 状态名）。
3. 页面仍混杂：两步开播、模拟评论、待审公区、多种 API 路径，**不适合对外演示**。
4. 大量历史代码（点赞、Canvas、TUILiveKit、IM REST）未归档。
5. 无独立 **监控页**（第二窗口只看画面 + 房间状态）。
6. 「开播」仍拆成「进 TRTC 房间」+「发起数字人」两步，未产品化为「一种播报模式一键开播」。

---

## 1. 交付 Demo 产品定义（验收口径）

### 1.1 用户故事（管理员）

1. 在 **管理台** 创建直播间，点击 **「开始数字人播报直播」**（唯一模式）。
2. 进入 **播控页**（单页）：左侧/上方 **实时评论列表**；右侧 **数字人预览**；底部 **会话状态**。
3. 对每条评论：
   - 点击 **「生成回复」** → 服务端（或占位 LLM）返回文案，填入 **多行文本框**；
   - 管理员可 **编辑** 文本框；
   - 点击 **「播报」** → 数字人用该文案 TTS/播报（`NotUseChat`），画面持续不中断。
4. 首次播报前自动完成：**创建并保持** 数智人会话 + TRTC 推流；之后仅 `speak`，不重复 `createsession`。
5. 点击 **「结束直播」** → `closesession` + 管理端退出 TRTC 预览。
6. 另开浏览器窗口打开 **监控页**（`/monitor/:roomId` 或带 `liveId`），**只读** 看同一房间数字人画面与基础状态。

### 1.2 本期明确不做

- 观众端先审后发、IM 真实弹幕、公区列表（可归档代码保留，默认路由不暴露）。
- 对话模式 / `use_chat` 云端大模型（交付 Demo 固定 **播报模式 `NotUseChat`**）。
- 多主播模式、Canvas 推流、TUILiveKit `LiveView` 主路径。
- 生产级持久化（评论/任务可继续用内存 + `rooms.json`，文档说明即可）。

---

## 2. 阶段划分与任务清单

建议按 **Phase A → E** 顺序实施；每阶段结束应可单独演示。

---

### Phase A — 代码归档与路由瘦身（P0）

**目标**：仓库对外只暴露「管理台 → 播控 → 监控」三条主路径。

| ID | 任务 | 具体操作 | 验收 |
|----|------|----------|------|
| A1 | 建立 `archive/` 目录 | 移动而非删除：`demo/live-like-demo.html`、`demo/minimal-live-broadcast.html`、`components/LiveLikeButton.vue`、`components/TencentLiveAudiencePanel.vue`、`utils/LikeRequestThrottle.js`、`examples/tencentLiveAudience.js`、`playground/src/views/LegacyPlayground.vue`、`AnchorCanvasLegacy.vue`、`AudienceLive.vue`（若本期不做观众端） | `npm run build` 通过；主路由无引用归档文件 |
| A2 | 精简 `router/index.js` | 默认路由：`/` → 重定向 `/admin`；保留 `/admin`、`/studio/:roomId`（新播控页，见 B）、`/monitor/:roomId`；`/legacy` 等改为 `/archive/...` 或 404 + README 链接 | 新同学只看 3 个 URL 即能跑通 |
| A3 | 精简 `vite.config.js` | 移除 `minimal-live-broadcast-html` 插件（若页面已归档） | 构建体积与配置可读性下降 |
| A4 | 精简 `server/index.mjs` | 将 IM REST、`comment-presubmit`、`digital-human/jobs`（presubmit 链路）、`barrage/approve-publish` 等 **移入** `server/archive/` 或 `#if 0` 注释块 + `ARCHIVE_LEGACY=1` 环境变量可选启用 | 默认 API 列表 ≤15 个端点；README 列出归档说明 |
| A5 | 更新 `README.md` | 单页「交付 Demo 快速开始」：`.env` → `npm run dev` → 创建房间 → 播控 → 监控 | PM 5 分钟内能跟文档操作 |

**AI 提示词要点**：「只做移动/路由删除，不改变 IVH 核心逻辑；归档路径写进 README。」

---

### Phase B — 播控页重构（P0）

**目标**：用 **一个页面** 替代当前 `AnchorBroadcast.vue` 的 ①②③④ 混杂面板。

| ID | 任务 | 文件建议 | 验收 |
|----|------|----------|------|
| B1 | 新建 `StudioBroadcast.vue` | 路由 `/studio/:roomId` | 旧 `AnchorBroadcast.vue` 可删或重定向 |
| B2 | 布局 | 两栏：左 **评论列表**（轮询）；右 **TRTC 预览** + 会话条（SessionId / 状态 / 远端 userId） | 1280px 宽屏演示友好 |
| B3 | 顶部工具栏 | 按钮：**开始直播** / **结束直播**（合并原「进房 + 发起数智人 + 保持会话」） | 一次点击后出现可播报的 `image_done` + 预览有画面 |
| B4 | 评论行 UI | 每条：`senderLabel`、原文、`createdAt`；操作：**生成回复**、**播报**（播报在已有回复文案时可用） | 无「公区显示 / 忽略 / 对话模式 / 模拟评论」按钮 |
| B5 | 回复编辑区 | 选中评论后展示 **多行 textarea**（`replyDraft`）；**生成回复** 写入；**播报** 读取当前 textarea 内容 | 可手动改字再播报 |
| B6 | 状态提示 | 展示：`ivhSessionKeptOpen`、`speak` 成功/失败、`dhJob.status` | 开发联调可见 |

**「开始直播」推荐后端语义（新 API，见 Phase C）**：

```
POST /api/rooms/:id/studio/start
→ 1) 可选：管理员 TRTC token 仅前端用，不进 pipeline
→ 2) 创建数智人会话 + startsession + 可选欢迎语 SEND_TEXT（可配置一句固定话术）
→ 3) 不 closesession；返回 { job, ivhSessionId, ivhVirtualmanUserId }
```

**「结束直播」**：

```
POST /api/rooms/:id/studio/stop
→ stop-session + 标记 room.broadcastStatus = 'idle'
```

---

### Phase C — 服务端：评论 + LLM + 播报 API（P0）

**目标**：数据权威在服务端；播报 **只** 走 `speak`（会话已存在）或 start 时首句。

| ID | 任务 | API | 请求/响应要点 |
|----|------|-----|----------------|
| C1 | 评论列表（演示用） | `GET /api/rooms/:id/studio/comments` | 合并 **待处理** 队列；字段：`id, text, senderLabel, createdAt, replyDraft?, replyGeneratedAt?, status: pending\|ready\|broadcasted` |
| C2 | 注入测试评论 | `POST /api/rooms/:id/studio/comments` | `{ text, sender_label? }` — **替代观众端**，供 PM 演示 |
| C3 | 生成回复 | `POST /api/rooms/:id/studio/comments/:commentId/generate-reply` | 调 LLM 或占位；写回 `replyDraft`；`status → ready` |
| C4 | 保存回复草稿 | `PATCH .../comments/:commentId` | `{ reply_draft }` — 前端 textarea blur 或显式保存 |
| C5 | 播报 | `POST .../comments/:commentId/broadcast` | body: `{ text? }` 默认用 `replyDraft`；内部：`ivhSendText(sessionId, text, { useChat: false })`；**若会话不存在则 409 提示先开始直播** |
| C6 | 开始/结束直播 | `POST .../studio/start` / `stop` | 见 B3；start 内复用 `runDigitalHumanPipeline` 或抽 `ensureIvhSession(room)` |
| C7 | 会话查询 | `GET /api/rooms/:id/studio/session` | `{ active, ivhSessionId, ivhVirtualmanUserId, job }` — 监控页复用 |

**LLM 模块（新建 `server/llmReply.mjs`）**：

| ID | 任务 | 说明 |
|----|------|------|
| C8 | 占位实现 | 未配置密钥时：`replyDraft = "感谢您的留言。关于「{评论摘要}」，我们的回答是……"` |
| C9 | 可插拔真实 LLM | 环境变量：`LLM_PROVIDER=openai_compatible` + `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL`；Prompt 模板写死在代码或 `.env` |
| C10 | 禁止 `use_chat` | 交付 Demo **固定** `NotUseChat`，LLM 在业务侧生成文案，IVH 只负责读稿 |

**重构 `ivhPipeline.mjs`（P0）**：

| ID | 任务 | 说明 |
|----|------|------|
| C11 | 抽出 `ensureIvhSession(room, deps)` | 若 `lastOpenIvhSessionByRoomInternalId` 已有且 statsession 仍有效 → 直接返回 sessionId |
| C12 | 抽出 `broadcastText(sessionId, text)` | 封装 `ivhSendText(..., { useChat: false })` |
| C13 | **禁止**「新播报任务」默认关旧会话 | 当前 `runDigitalHumanPipeline` 在每次 job 前 `closesession` 旧会话 — **与「长驻流」冲突**；改为：仅 `studio/stop` 或显式「重建会话」时关闭 |

> **根因**：`ivhPipeline.mjs` L69–77 每次新 job 会先 `closesession` 上一会话，导致画面闪断。交付 Demo 必须改为 **单会话多句 `speak`**。

---

### Phase D — 监控页（P1）

| ID | 任务 | 说明 | 验收 |
|----|------|------|------|
| D1 | 新建 `MonitorLive.vue` | 路由 `/monitor/:roomId` | 无评论操作，只读 |
| D2 | TRTC 只读进房 | 复用 `useTrtcStage.js`，userId 如 `monitor_*` | 与播控页同 `liveId` 能看到数字人 |
| D3 | 状态条 | 轮询 `GET .../studio/session` + `active-job` | 显示 liveId、SessionId、是否在播 |
| D4 | 管理台入口 | `AdminRooms.vue` 增加「监控窗口」链接 `target=_blank` | PM 双屏演示 |

---

### Phase E — 文档与交付包（P1）

| ID | 任务 | 产出 |
|----|------|------|
| E1 | `docs/delivery-demo-script.md` | 5 分钟演示脚本：建房间 → 开始直播 → 注入 2 条评论 → 生成 → 改稿 → 播报 → 监控页 → 结束 |
| E2 | `.env.example` 精简 | 只保留：`TRTC_*`、`IVH_*`、`LLM_*`（可选）、删除 IM 相关默认说明或移入 archive 文档 |
| E3 | 腾讯侧 FAQ | 见下文 **§4**，给 PM 转发技术支持 |
| E4 | `examples/studio-smoke.sh` | curl：start → post comment → generate → broadcast → stop |

---

## 3. 推荐实施顺序（给 AI 的单次 Session 切分）

```
Session 1: Phase A（归档 + 路由 + README）
Session 2: Phase C11–C13 + C6（会话长驻 + studio/start|stop）
Session 3: Phase C1–C5 + C8–C9（评论 + LLM + broadcast API）
Session 4: Phase B（StudioBroadcast.vue 对接 API）
Session 5: Phase D + E（监控页 + 演示脚本）
```

每 Session 结束：`npm run build` + 手动走一遍演示脚本中的步骤。

---

## 4. 腾讯数智人「长驻视频流」— 产品/技术支持咨询清单

以下结论基于当前代码与 aPaaS 行为，**建议在对接腾讯技术支持时一并确认**。

### 4.1 我们已能做到的（代码侧）

| 项 | 机制 |
|----|------|
| 不主动退房 | 不调用 `closesession`；`IVH_AUTO_CLOSE_SESSION` 保持 **未设置** |
| 同会话多句 | 对同一 `SessionId` 多次 `SEND_TEXT` + `NotUseChat`（即 `speak`） |
| 手动结束 | 仅 `studio/stop` → `closesession` |

### 4.2 需要向腾讯确认的限制（可能影响「一直不断流」）

| 序号 | 问题 | 背景 |
|------|------|------|
| Q1 | **单 Session 最大时长 / 空闲超时** 是多少？超时是否自动 `closesession` 并 TRTC 退房？ | 长直播 Demo 核心风险 |
| Q2 | **单账号并发 Session 数** 与 **单项目 QPS** 限制？ | 多房间/多 Demo 并行 |
| Q3 | 两次 `SEND_TEXT` 之间若间隔很长，流是否保持最后一帧 / 待机画面？ | 评论稀疏时画面是否黑屏 |
| Q4 | `SessionStatus=2/4` 时推荐的重连策略：必须新 `createsession` 还是支持恢复？ | 断线恢复产品化 |
| Q5 | TRTC 外部进房（`TrtcUseExternalApp` + `TrtcStrRoomId`）下，**仅数智人推流、无真人 anchor** 是否为官方推荐形态？ | 与当前架构一致性的书面确认 |
| Q6 | 是否存在 **「保活」类 Command** 或 **心跳** 接口，避免静默会话被回收？ | 若 Q1 存在空闲回收 |
| Q7 | `NotUseChat` 纯播报 vs 空 `ChatCommand` 对话模式，在计费与时长上是否不同？ | 交付 Demo 固定播报模式 |

### 4.3 若腾讯确认「会话有时长上限」

**降级方案（仍可控，可写进 Demo 说明）**：

1. 播控页展示 **会话剩余时间**（若 API 返回）或 **已播报句数**。
2. 接近上限前提示管理员 **「结束并重新开始直播」**（自动 welcome 语 + 新 Session）。
3. 监控页检测 `peer-leave` 后显示 **「数字人已离线，请在播控页点击恢复」**。

---

## 5. 文件级变更映射（Quick Reference）

| 动作 | 路径 |
|------|------|
| 新建 | `playground/src/views/StudioBroadcast.vue` |
| 新建 | `playground/src/views/MonitorLive.vue` |
| 新建 | `server/studio.mjs`（或拆 `studioComments.mjs` + `studioSession.mjs`） |
| 新建 | `server/llmReply.mjs` |
| 重构 | `server/ivhPipeline.mjs` → `ensureIvhSession` / `broadcastText` |
| 重构 | `server/index.mjs` → 挂载 `/api/rooms/:id/studio/*` |
| 归档 | 见 Phase A1 |
| 弃用/重定向 | `AnchorBroadcast.vue` → `/studio/:roomId` |
| 更新 | `AdminRooms.vue` — 仅「开始数字人直播」入口 |
| 更新 | `docs/delivery-demo-script.md`（Phase E1） |

---

## 6. API 一览（目标态，默认启用）

```
GET  /api/health
GET  /api/rooms
POST /api/rooms
GET  /api/rooms/:id
GET  /api/rooms?liveId=          # 可选保留

POST /api/rooms/:id/token        # 播控/监控进 TRTC 预览

POST /api/rooms/:id/studio/start
POST /api/rooms/:id/studio/stop
GET  /api/rooms/:id/studio/session

GET  /api/rooms/:id/studio/comments
POST /api/rooms/:id/studio/comments
PATCH /api/rooms/:id/studio/comments/:commentId
POST /api/rooms/:id/studio/comments/:commentId/generate-reply
POST /api/rooms/:id/studio/comments/:commentId/broadcast
```

---

## 7. 环境与配置（目标 `.env`）

```bash
# 必填
TRTC_SDK_APP_ID=
TRTC_SECRET_KEY=
IVH_APP_KEY=
IVH_ACCESS_TOKEN=
IVH_VIRTUALMAN_PROJECT_ID=

# 勿设（除非联调省并发）
# IVH_AUTO_CLOSE_SESSION=1

# 可选：真实 LLM；不设则占位回复
# LLM_API_KEY=
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4o-mini

VITE_TRTC_SDK_APP_ID=   # 与 TRTC_SDK_APP_ID 相同
```

---

## 8. 完成定义（Definition of Done）

- [ ] 仓库主路径仅 **管理台 / 播控 / 监控**；历史能力在 `archive/` 可查。
- [ ] 管理员可在 **无观众端** 情况下：注入评论 → 生成回复 → 编辑 → 播报，数字人画面 **同 Session 连续**。
- [ ] **开始直播** 一键完成数智人会话 + 首帧；**结束直播** 一键 `closesession`。
- [ ] 监控页第二窗口可看到 **同一 liveId** 数字人画面。
- [ ] README + 演示脚本 + 腾讯 FAQ 可交给 PM 对外讲解。
- [ ] `npm run build` 与 `node --check server/index.mjs` 通过。

---

*文档版本：与 main @ 2026-05-31 对话同步；实施时以实际分支为准更新勾选状态。*
