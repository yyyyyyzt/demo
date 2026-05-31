# 腾讯数智人「长驻视频流」— 技术支持咨询清单

交付 Demo 固定 **播报模式**（`NotUseChat`），LLM 在业务侧生成文案，IVH 仅 TTS/读稿。以下问题建议在对接腾讯技术支持时确认。

## 我们已能做到的（代码侧）

| 项 | 机制 |
|----|------|
| 不主动退房 | 默认不调用 `closesession`；勿设 `IVH_AUTO_CLOSE_SESSION=1` |
| 同会话多句 | 对同一 `SessionId` 多次 `SEND_TEXT` + `NotUseChat` |
| 手动结束 | 仅播控 **结束直播** → `POST .../studio/stop` → `closesession` |

## 需要向腾讯确认的限制

| 序号 | 问题 |
|------|------|
| Q1 | 单 Session 最大时长 / 空闲超时？超时是否自动退房？ |
| Q2 | 单账号并发 Session 数与单项目 QPS？ |
| Q3 | 两次 `SEND_TEXT` 间隔很长时，流是否保持最后一帧？ |
| Q4 | `SessionStatus=2/4` 时重连：新 `createsession` 还是可恢复？ |
| Q5 | `TrtcUseExternalApp` + 仅数智人推流、无真人 anchor 是否为推荐形态？ |
| Q6 | 是否存在保活/心跳接口避免静默会话被回收？ |
| Q7 | `NotUseChat` 与对话模式在计费与时长上是否不同？ |

## 若确认有时长上限（降级方案）

1. 播控页展示会话已播报句数或剩余时间（若 API 提供）。
2. 接近上限提示 **结束并重新开始直播**。
3. 监控页检测远端离开后提示在播控页恢复。
