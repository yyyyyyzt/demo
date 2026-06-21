# 归档代码（交付 Demo 主路径不依赖）

以下文件已从主路由与默认 API 中移除，仅供历史参考或本地对照。需要旧能力时：

1. 将文件复制回对应路径，或
2. 设置环境变量 `ARCHIVE_LEGACY=1` 后重启 API，以启用 `server/archive/legacyRoutes.mjs` 中的旧端点。

## 目录映射

| 原路径 | 归档路径 |
|--------|----------|
| `demo/live-like-demo.html` | `archive/demo/live-like-demo.html` |
| `demo/minimal-live-broadcast.html` | `archive/demo/minimal-live-broadcast.html` |
| `components/LiveLikeButton.vue` | `archive/components/LiveLikeButton.vue` |
| `components/TencentLiveAudiencePanel.vue` | `archive/components/TencentLiveAudiencePanel.vue` |
| `utils/LikeRequestThrottle.js` | `archive/utils/LikeRequestThrottle.js` |
| `examples/tencentLiveAudience.js` | `archive/examples/tencentLiveAudience.js` |
| `playground/src/views/LegacyPlayground.vue` | `archive/playground-src/views/LegacyPlayground.vue` |
| `playground/src/views/AnchorCanvasLegacy.vue` | `archive/playground-src/views/AnchorCanvasLegacy.vue` |
| `playground/src/utils/useTuiLiveBroadcast.js` | `archive/playground-src/utils/useTuiLiveBroadcast.js` |
| `server/imRest.mjs`（旧版仅发消息） | `archive/server/imRest.mjs` |

> 说明：观众端 `AudienceLive.vue` 已**重新启用并重写**为生产标准版本（路由 `/live/:liveId`，原生 TRTC 订阅 + IM 评论），不再属于归档。
> `useTuiLiveBroadcast.js`（TUILiveKit `startLive` 封装）在改为「OBS 拉流转推」后不再被主路径使用，移入归档。
> 当前评论的 IM 能力请用 `server/imRest.mjs`（含撤回/禁言）。

## 已移除的主路由

- `/legacy` 点赞调试页
- `/anchor-canvas/:roomId` Canvas 遗留推流

交付 Demo 主路径：`/admin` → `/studio/:roomId` → `/live/:liveId`（观众）→ `/monitor/:roomId`。
