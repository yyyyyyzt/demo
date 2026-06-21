# 在腾讯云「直播管理系统」中看到本 Demo 直播间

文档：[直播管理系统（Vue3）](https://cloud.tencent.com/document/product/647/123012)、[TUILiveKit_Manager](https://github.com/Tencent-RTC/TUILiveKit_Manager)

## 现在 Demo 的做法

开播时（`POST /api/rooms/:id/studio/start`）服务端可选调用 TUILiveKit **`create_room` REST**（`server/tuiLiveRest.mjs`），在云端创建一个 Live 房间，`RoomId = liveId`、`Owner_Account = obs_robot_{liveId}`。这样：

- 在腾讯云直播管理后台 / 自部署的 TUILiveKit_Manager 中，用 **`liveId`** 即可检索到该直播间。
- 该房间对应的 **IM 群 ID 也为 `liveId`**，评论链路与撤回/禁言都基于该群（见 [IM 评论链路](im-comment-moderation.md)）。

结束直播时调用 `destroy_room`（可选）。

## 与画面可见性的关系

管理后台列出的是**直播会话元数据**；画面是否可见取决于是否有流推入该房间：

- 生产模式：OBS 把合成画面 RTMP 推回 `liveId`，房间内即有主播流。
- 直连模式：数智人直接进房推流。

本项目观众端不依赖 TUILiveKit `LiveView`（只渲染 anchor 流），而是原生 `trtc-sdk-v5` 订阅房间内任意远端视频，因此 OBS/数智人推的流都能看到（原因见 [trtc-ivh-integration](trtc-ivh-integration.md) 第三节）。

## 环境配置

```bash
# 与 TRTC 同一 SDKAppID 的 App 管理员账号
IM_REST_ADMIN_USER_ID=你的管理员userId
# 或 TUILIVE_REST_ADMIN_USER_ID=
# TUILIVE_REGISTER_ON_STUDIO=0  # 设 0 则开播不调用 create_room
```

自检：

```bash
curl -s http://127.0.0.1:3001/api/health | grep -o '"tuiLiveRestConfigured":[a-z]*'
```

## 常见问题

| 现象 | 处理 |
|------|------|
| 后台搜不到房间 | 确认已配置 App 管理员、已开通 TUILiveKit；`create_room` 的 `RoomId` 须等于 `liveId` |
| create_room 报「已存在」| 房间已创建，可忽略或先解散 |
| 有房间无画面 | 生产模式需 OBS 已推流；直连模式需数智人已进房 |
