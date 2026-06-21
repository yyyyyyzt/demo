<template>
  <div class="audience">
    <header class="audience__bar">
      <div class="audience__title">
        <span class="live-dot" :class="{ on: hasRemoteVideo }" />
        {{ room?.title || '数字人直播间' }}
      </div>
      <code v-if="room" class="audience__id">{{ room.liveId }}</code>
    </header>

    <p v-if="err" class="banner banner--err">{{ err }}</p>
    <p v-if="trtcError" class="banner banner--err">{{ trtcError }}</p>

    <div class="stage-host">
      <div ref="stageRef" class="stage" />
      <p v-if="!hasRemoteVideo" class="stage-overlay">
        {{ entered ? '等待主播画面…（主播侧 OBS 推流后即可观看）' : '正在进入直播间…' }}
      </p>
      <!-- 直播间装修浮层（演示）：标题条 -->
      <div v-if="room" class="decor-lower">
        <span class="decor-lower__tag">政策宣讲</span>
        <span class="decor-lower__title">{{ room.title }}</span>
      </div>
    </div>

    <section class="comments">
      <h2 class="comments__title">直播评论</h2>
      <ul class="comment-stream">
        <li v-for="c in comments" :key="c.id" class="comment" :class="{ 'comment--hl': c.broadcasted }">
          <span class="comment__user">{{ c.senderLabel }}</span>
          <span class="comment__text">{{ c.text }}</span>
          <span v-if="c.broadcasted" class="comment__badge">主播已回复</span>
        </li>
        <li v-if="!comments.length" class="comment comment--empty">还没有评论，快来抢沙发～</li>
      </ul>
    </section>

    <form class="composer" @submit.prevent="sendComment">
      <input
        v-model.trim="draft"
        class="composer__input"
        type="text"
        maxlength="200"
        placeholder="说点什么…（发送后进入主播评论台）"
      />
      <button type="submit" class="composer__btn" :disabled="sending || !draft">
        {{ sending ? '…' : '发送' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTrtcStage } from '../utils/useTrtcStage.js'

const route = useRoute()
const liveId = computed(() => route.params.liveId)

const { stageRef, status, errorMessage: trtcError, hasRemoteVideo, enterRoom, exitRoom } =
  useTrtcStage()

const room = ref(null)
const err = ref('')
const comments = ref([])
const draft = ref('')
const sending = ref(false)
const myUserId = ref('')
const entered = computed(() => status.value === 'entered')

let pollTimer = null

async function resolveRoom() {
  const r = await fetch(`/api/rooms?liveId=${encodeURIComponent(liveId.value)}`)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || r.statusText)
  room.value = j.room
}

async function enter() {
  const tokRes = await fetch(`/api/rooms/${room.value.id}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'audience' }),
  })
  const tok = await tokRes.json()
  if (!tokRes.ok) throw new Error(tok.error || tokRes.statusText)
  myUserId.value = tok.userId
  await enterRoom({
    sdkAppId: tok.sdkAppId,
    userId: tok.userId,
    userSig: tok.userSig,
    strRoomId: tok.liveId,
    role: 'audience',
  })
}

async function refreshComments() {
  if (!room.value) return
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/comments/public`)
    const j = await r.json()
    if (r.ok) comments.value = j.items || []
  } catch {
    /* noop */
  }
}

async function sendComment() {
  if (!room.value || !draft.value) return
  sending.value = true
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: draft.value,
        sender_label: '观众',
        sender_user_id: myUserId.value,
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    draft.value = ''
    await refreshComments()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  try {
    await resolveRoom()
    await refreshComments()
    await enter()
  } catch (e) {
    err.value = e?.message || String(e)
  }
  pollTimer = setInterval(refreshComments, 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  exitRoom()
})
</script>

<style scoped>
.audience {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: max(8px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
}
.audience__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 4px 10px;
}
.audience__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 1rem;
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
}
.live-dot.on {
  background: #ff4d4f;
  box-shadow: 0 0 0 4px rgba(255, 77, 79, 0.18);
}
.audience__id {
  font-size: 0.72rem;
  color: #9ad4ff;
}
.stage-host {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 12px;
  aspect-ratio: 9 / 16;
  max-height: 62vh;
  overflow: hidden;
}
.stage {
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
  z-index: 1;
}
.decor-lower {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  z-index: 2;
}
.decor-lower__tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: linear-gradient(135deg, #4f8dff, #7e5bff);
  color: #fff;
}
.decor-lower__title {
  font-size: 13px;
  color: #fff;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.comments {
  flex: 1;
  min-height: 0;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
}
.comments__title {
  margin: 0 0 6px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}
.comment-stream {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-height: 80px;
  max-height: 24vh;
  overflow-y: auto;
}
.comment {
  font-size: 0.85rem;
  line-height: 1.5;
  padding: 3px 0;
}
.comment__user {
  color: #9ad4ff;
  margin-right: 6px;
}
.comment__text {
  color: rgba(255, 255, 255, 0.9);
}
.comment__badge {
  margin-left: 6px;
  font-size: 11px;
  color: #b7eb8f;
}
.comment--empty {
  color: rgba(255, 255, 255, 0.4);
}
.composer {
  display: flex;
  gap: 8px;
  padding-top: 10px;
}
.composer__input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 0.9rem;
}
.composer__btn {
  border: none;
  border-radius: 999px;
  padding: 0 18px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #4f8dff, #7e5bff);
  cursor: pointer;
}
.composer__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.banner {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.82rem;
}
.banner--err {
  background: rgba(255, 77, 79, 0.16);
  color: #ffccc7;
}
</style>

<style>
.audience .stage > div,
.audience .stage video {
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain !important;
  object-position: center center !important;
  background: #000;
}
</style>
