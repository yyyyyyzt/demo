# TRTC × 数智人云渲染（aPaaS）集成说明

本文档描述数智人云渲染（aPaaS，`gw.tvs.qq.com`）与 TRTC 直播间的两种对接形态，以及本项目的选择。

## 一、数智人会话的三种协议

`POST /v2/ivh/sessionmanager/sessionmanagerservice/createsession` 的 `Protocol` 支持：

| 协议 | 数智人画面 | 本项目用途 |
|------|-----------|-----------|
| `trtc` | 数智人作为一个 TRTC 用户**直接进房推流** | **直连模式**（`mode=direct`，快速验证）|
| `rtmp` | 返回 `PlayStreamAddr` 一路可拉取流 | **生产模式**（`mode=production`，供 OBS 拉流转推）|
| `webrtc` | 返回 webrtc 播放地址 | 预留 |

另：任意协议 + `CssCustomPushUrl` 可让数智人直推到自定义云直播地址（此时不返回 `PlayStreamAddr`）。

参考：[新建直播流会话](https://cloud.tencent.com/document/product/1240/100388)、[会话交互服务 API 概述](https://cloud.tencent.com/document/product/1240/100385)、[签名说明](https://cloud.tencent.com/document/product/1240/107197)。

## 二、本项目的对接形态

### 生产模式（默认，推荐）

1. 服务端 `ensureIvhSession(room, deps, { mode:'rtmp' })` → `ivhCreateRtmpSession` → 轮询就绪 → `startsession` → 取 `PlayStreamAddr`。
2. 该地址作为 **OBS 拉流地址**；OBS 抠像/装修后推回 TRTC 直播间（详见 [OBS 拉流转推管线](obs-pull-push-pipeline.md)）。
3. 观众/监控用原生 `trtc-sdk-v5` 进同一 `strRoomId=liveId` 订阅 OBS 推回的合成流。

### 直连模式（快速验证）

`ensureIvhSession(..., { mode:'trtc' })`：数智人以外部 TRTC AppId + `TrtcStrRoomId=liveId` 直接进房；观众/监控直接订阅数智人画面。用于无 OBS 时验证「数智人开口说话」。

## 三、为什么观众端不用 TUILiveKit `LiveView`

`tuikit-atomicx-vue3` 的 `<LiveView>` 只渲染「该 Live 的 anchor」发布的主流。

- 直连模式：数智人是另一个 TRTC 用户，不是 anchor，`LiveView` 不渲染它。
- 生产模式：OBS 以 `obs_robot_*` 身份 RTMP 推流，也不是经 `startLive` 的 anchor。

因此观众端统一改用原生 `trtc-sdk-v5` 监听 `REMOTE_VIDEO_AVAILABLE` 订阅房间内任意远端视频（见 `playground/src/utils/useTrtcStage.js`），与「谁是 anchor」解耦。

## 四、播报驱动

`broadcastText(sessionId, text)` → aPaaS `command` 接口 `SEND_TEXT`（`NotUseChat` 纯文本驱动 TTS）。文案由 `server/llmReply.mjs` 生成、人工二次编辑后再播报。

## 五、关键代码入口

| 文件 | 作用 |
|------|------|
| `server/ivhApaas.mjs` | createsession（trtc / rtmp）、statsession、startsession、command、closesession + 签名 |
| `server/ivhPipeline.mjs` | `ensureIvhSession`（双模式）、`broadcastText`、会话复用与释放 |
| `server/trtcRtmp.mjs` | 生成 OBS RTMP 推流地址 |
| `server/studio.mjs` | 开播/结束、OBS 端点、评论与播报 |
| `playground/src/utils/useTrtcStage.js` | 原生 TRTC 订阅远端视频 |

## 六、环境变量

`IVH_APP_KEY`、`IVH_ACCESS_TOKEN`、`IVH_VIRTUALMAN_PROJECT_ID`（必填）；可选 `IVH_TRTC_USER_ID`、`IVH_TRTC_PRIVATE_MAP_KEY`、`IVH_BASE_URL`、`IVH_AUTO_CLOSE_SESSION`。与 TRTC `TRTC_SDK_APP_ID` / `TRTC_SECRET_KEY` 并存。`GET /api/health` 查看 `ivhConfigured`。

*文档随 `main` 分支迭代更新。*
