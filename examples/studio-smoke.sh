#!/usr/bin/env bash
# 交付 Demo studio API 冒烟：start → comment → generate → broadcast → stop
set -euo pipefail

API="${API_BASE:-http://127.0.0.1:3001}"
ROOM_ID="${1:-}"

if [[ -z "$ROOM_ID" ]]; then
  echo "用法: $0 <room_internal_id>" >&2
  echo "示例: 先在管理台创建房间，从 rooms.json 或 GET /api/rooms 取 id" >&2
  exit 1
fi

echo "== health =="
curl -s "$API/api/health" | head -c 400
echo -e "\n"

echo "== studio/start =="
START=$(curl -s -X POST "$API/api/rooms/$ROOM_ID/studio/start" \
  -H 'Content-Type: application/json' -d '{}')
echo "$START" | head -c 500
echo -e "\n"

echo "== studio/comments (inject) =="
CMT=$(curl -s -X POST "$API/api/rooms/$ROOM_ID/studio/comments" \
  -H 'Content-Type: application/json' \
  -d '{"text":"冒烟测试：请问今天有什么活动？","sender_label":"smoke"}')
echo "$CMT"
COMMENT_ID=$(echo "$CMT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)
if [[ -z "$COMMENT_ID" ]]; then
  echo "无法解析 comment id" >&2
  exit 1
fi

echo "== generate-reply =="
curl -s -X POST "$API/api/rooms/$ROOM_ID/studio/comments/$COMMENT_ID/generate-reply"
echo -e "\n"

echo "== broadcast =="
curl -s -X POST "$API/api/rooms/$ROOM_ID/studio/comments/$COMMENT_ID/broadcast" \
  -H 'Content-Type: application/json' -d '{}'
echo -e "\n"

echo "== session =="
curl -s "$API/api/rooms/$ROOM_ID/studio/session"
echo -e "\n"

echo "== studio/stop =="
curl -s -X POST "$API/api/rooms/$ROOM_ID/studio/stop"
echo -e "\n"
echo "done."
