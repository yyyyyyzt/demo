#!/usr/bin/env bash
# 数智人 HTTP 云渲染最小联调：依赖已启动的本地 API（npm run server / npm run dev）
# 用法：
#   export ROOM_ID=<管理台创建房间返回的 id>
#   ./examples/ivh-api-smoke.sh
# 可选：API=http://127.0.0.1:3001 TEXT="你的测试句"

set -euo pipefail

API="${API:-http://127.0.0.1:3001}"
ROOM_ID="${ROOM_ID:?请先 export ROOM_ID=房间内部 id（/admin 创建房间后 JSON 里的 id）}"

TEXT="${TEXT:-欢迎各位来到直播间，我是数字人主播，下面为您带来精彩内容。}"

echo "== health =="
curl -sS "${API}/api/health" | head -c 800
echo
echo

echo "== manual-job（纯播报 NotUseChat）=="
curl -sS -X POST "${API}/api/rooms/${ROOM_ID}/digital-human/manual-job" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg t "$TEXT" '{text:$t, use_chat:false}')" | head -c 1200
echo
echo

echo "== active-job（可重复执行以轮询状态）=="
curl -sS "${API}/api/rooms/${ROOM_ID}/digital-human/active-job" | head -c 1200
echo
echo

echo "== speak（需上一步任务已进入 image_done；否则 409 为预期）=="
curl -sS -X POST "${API}/api/rooms/${ROOM_ID}/digital-human/speak" \
  -H 'Content-Type: application/json' \
  -d '{"text":"喜欢的朋友记得点点关注，我们下次再见。","use_chat":false}' | head -c 1200
echo
