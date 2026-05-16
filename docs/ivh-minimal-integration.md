# 数智人云渲染：两条最小接入路径（学习用）

本文对比 **浏览器 SDK 预览** 与 **HTTP API + TRTC 进房**（本仓库实现），便于调试与建立心智模型。仅需「几句直播话术能播出来」时，任选一条路径即可。

---

## 一、SDK 路径（官方 H5 云渲染 Demo）

**适用**：先在浏览器里看清数智人形象、口型与音色，不依赖本仓库服务端。

**官方仓库**：[TencentCloud/virtualman-render-demo](https://github.com/TencentCloud/virtualman-render-demo)  
重点目录：**`server-render-demo/`**（服务端云渲染画面在浏览器里由 `TXIVHSDK` 拉流展示）。

### 最小步骤

1. 克隆 demo 到本地，用静态服务器打开 `server-render-demo/index.html`（不要用 `file://`，部分能力受浏览器安全策略限制）。
2. 在数智人控制台获取 **`virtualmanProjectId`** 与页面所需的 **`sign`**（或按 demo README 的 URL 参数说明配置）。
3. 在 demo 页用文本输入发送一句话；内部等价于 `IVH.play({ command: 'text', data: '...', chatCommand: ... })`：
   - **纯播报（TTS）**：`chatCommand: 'NotUseChat'`（只朗读你写的字）。
   - **对话模式**：`chatCommand: ''`（空字符串，走云端会话/大模型链路，依赖项目侧配置）。

### 与本仓库的关系

- SDK 路径：**渲染与交互在浏览器内完成**，TRTC 可暂不出现。
- 本仓库 API 路径：由**服务端**调 `gw.tvs.qq.com`，数智人以 **TRTC 远端用户**进你配置的 **`liveId`**，观众用 **TUILiveKit `LiveView`** 看播。

---

## 二、API 路径（本仓库：aPaaS HTTP + TRTC）

**适用**：与真实直播一致——数智人作为房间内一路视频，观众端 `joinLive` 同 `liveId` 即可拉流。

### 1. 环境变量（根目录 `.env`）

| 变量 | 作用 |
|------|------|
| `TRTC_SDK_APP_ID` / `TRTC_SECRET_KEY` | 服务端签发 UserSig（主播、观众、数智人 userId 均需） |
| `IVH_APP_KEY` / `IVH_ACCESS_TOKEN` / `IVH_VIRTUALMAN_PROJECT_ID` | 数智人 aPaaS 网关鉴权与形象项目 |
| `VITE_TRTC_SDK_APP_ID` | 与 TRTC SDKAppId 同值，给观众页默认表单 |

可选：`IVH_TRTC_USER_ID`（数智人进房 userId 前缀）、`IVH_TRTC_PRIVATE_MAP_KEY`（无高级进房权限时常用 `dummy`）、`IVH_AUTO_CLOSE_SESSION=1`（发完一句立刻关会话，仅联调省并发）。

### 2. 启动

```bash
cp .env.example .env   # 已复制则跳过
npm run dev
```

自检：`curl -s http://127.0.0.1:3001/api/health | jq` → `ivhConfigured: true`，`dhAllowManualJob: true`（默认允许手动调试接口）。

### 3. 最小业务流程（推荐顺序）

1. 浏览器打开 **`/admin`**，创建一个房间，记下返回的 **`id`**（内部房间 id）与 **`liveId`**。
2. 打开 **`/anchor/:id`** → **「以主播身份开启直播」**（必须先有直播会话，观众与数智人才能进同一 `liveId`）。
3. **发起数字人**（二选一）：
   - **页面**：同页 **「数字人 · 手动调试」** → 填入话术 →「发起手动数字人任务」；首条完成后可「对当前会话再发一句」做多轮。
   - **命令行**：见仓库根目录 `examples/ivh-api-smoke.sh`。
4. **观众端**：新开浏览器窗口打开 **`/`**，填写同一 **`liveId`** 与 SDKAppId，进房观看 `LiveView`。

> 同一标签页不要同时登录主播与观众；主播与观众请分窗口。

### 4. 核心 HTTP 接口（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | TRTC / IVH / `dhAllowManualJob` 等诊断 |
| `POST` | `/api/rooms/:id/digital-human/manual-job` | Body：`{ "text": "...", "use_chat": false }`。不走评论 presubmit，适合学习 |
| `POST` | `/api/rooms/:id/digital-human/speak` | 当前活跃任务 `image_done` 且仍有会话时，再 `SEND_TEXT` 一句 |
| `GET` | `/api/rooms/:id/digital-human/active-job` | 轮询任务状态、`ivhVirtualmanUserId`、`ivhSessionId` 等 |

生产若关闭手动接口：环境变量 **`DH_ALLOW_MANUAL_JOB=0`**。

评论驱动的正式链路仍为：`comment-presubmit` → `POST .../digital-human/jobs`（带 `presubmit_ticket`），见 `docs/trtc-ivh-integration.md`。

---

## 三、示例直播话术（可直接复制）

下面句子适合 **`use_chat: false`**（纯 TTS / `NotUseChat`）试听咬字与节奏；若勾选对话模式，模型可能会扩展发挥，不限于字面朗读。

```
欢迎各位来到直播间，我是今天的数字人主播，感谢大家的支持。
下面为大家带来一段精彩内容，请锁定我们的直播间。
喜欢的朋友记得点点关注，不迷路。
我们稍作休息，精彩马上继续。
感谢各位的陪伴，祝生活愉快，我们下次再见。
```

---

## 四、学习思路对照

| 问题 | SDK 路径 | API 路径（本仓库） |
|------|----------|---------------------|
| 最快看到形象 | 跑官方 `server-render-demo` | 主播开播 + manual-job + 观众进房 |
| 文本怎么进数智人 | 页面调 `IVH.play` | 服务端 `SEND_TEXT`（见 `server/ivhApaas.mjs`） |
| 与 TRTC 关系 | 可选 | **强绑定**：`createsession` 里 `ProtocolOption` 填外部 TRTC 房间 |
| 多轮说话 | demo 内多次 `play` | 首条 `manual-job` 后 `speak`（同 `ivhSessionId`） |

更完整的架构与序列图见 **`docs/trtc-ivh-integration.md`**。
