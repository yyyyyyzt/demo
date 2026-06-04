# 在腾讯云「直播管理系统」中看到本 Demo 直播间

文档：[直播管理系统（Vue3）](https://cloud.tencent.com/document/product/647/123012)

## 为什么之前看不到？

本 Demo 数智人链路走的是 **外部 TRTC 进房**（`TrtcStrRoomId = liveId`），若只在播控页用原生 `trtc-sdk-v5` `enterRoom`，**不会**在 TUILiveKit 直播列表/监控里登记为一场「直播」。

腾讯云直播管理后台列出的，是走 **TUILiveKit 直播引擎** 创建并 `startLive` 的房间，而不是任意 TRTC 字符串房间号。

## 现在 Demo 的做法（已接入）

| 步骤 | 位置 | 作用 |
|------|------|------|
| 1 | 服务端 `studio/start` | 可选调用 `create_room` REST，在云端创建 Live 房间 |
| 2 | 播控页「开始直播」 | `login` + `startLive({ liveId, liveName })`（与 `liveId` 一致） |
| 3 | 服务端 `studio/start` | 数智人 `createsession` 进同一 `liveId` 推流 |
| 4 | 结束直播 | 客户端 `endLive` + 服务端 `destroy_room`（可选） |

在管理后台用 **`liveId`**（如 `live_xxxxxxxxxxxx`）搜索，应能在 **直播间管理 / 直播监控** 中看到。

## 环境配置

在 `.env` 中增加（与 TRTC 同应用、**App 管理员**账号）：

```bash
TUILIVE_REST_ADMIN_USER_ID=你的管理员userId
# 或复用 IM_REST_ADMIN_USER_ID=
```

并确保已 [开通 TUILiveKit](https://cloud.tencent.com/document/product/647/105439)。

自检：

```bash
curl -s http://127.0.0.1:3001/api/health | jq '.tuiLiveRestConfigured'
```

## 管理后台对接方式（官方）

若需完整运营能力（礼物、封禁、多路监播等），可部署官方开源管理端：

- 仓库：https://github.com/Tencent-RTC/TUILiveKit_Manager  
- 配置同一 `SDKAppID`、管理员 `userId` / `UserSig`  
- 与本 Demo 使用相同 `liveId` 即可在同一后台看到房间

## 常见问题

| 现象 | 处理 |
|------|------|
| 仍看不到 | 确认播控页已点「开始直播」且未报错；`startLive` 的 `liveId` 须与房间 `liveId` 完全一致 |
| create_room 报错 | 房间可能已存在，可忽略或先解散；检查管理员账号是否为 App 管理员 |
| 有房间无画面 | 管理后台看的是直播会话；数智人画面在播控预览，需数智人已进房推流 |
| 与 IVH 冲突 | 先 `startLive` 再拉数智人；勿用两个不同 SDK 以同一 `anchor_*` 重复进房 |
