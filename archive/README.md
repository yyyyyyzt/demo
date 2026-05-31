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
| `playground/src/views/AudienceLive.vue` | `archive/playground-src/views/AudienceLive.vue` |
| `server/imRest.mjs` | `archive/server/imRest.mjs` |

## 已移除的主路由

- `/` 观众 H5 → 已归档 `AudienceLive.vue`
- `/legacy` 点赞调试页
- `/anchor-canvas/:roomId` Canvas 遗留推流

交付 Demo 主路径：`/admin` → `/studio/:roomId` → `/monitor/:roomId`。
