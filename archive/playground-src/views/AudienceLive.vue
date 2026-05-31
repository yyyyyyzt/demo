<template>
  <div class="audience">
    <template v-if="!joined">
      <main class="gate">
        <h1 class="gate__title">观众端 · 数字人直播</h1>
        <p class="gate__hint">
          填入与主播相同的直播间 ID（即创建房间返回的 <code>liveId</code>），点击「进入直播间」后通过原生 TRTC SDK 直接订阅房间内任意远端视频流（含数字人）。
        </p>
        <p class="gate__hint gate__hint--soft">
          发送评论仅进入<strong>待审队列</strong>，不会在公区直接展示；主持人「公区显示」后，本页下方公区列表会出现该条。
        </p>

        <label class="field">
          <span>直播间 ID（liveId）</span>
          <input v-model.trim="liveIdInput" type="text" autocomplete="off" placeholder="例如：live_xxxxxxxxxxxx" />
        </label>
        <label class="field">
          <span>SDKAppID</span>
          <input v-model.trim="sdkAppIdInput" type="text" inputmode="numeric" placeholder="默认读取 VITE_TRTC_SDK_APP_ID" />
        </label>
        <label class="field">
          <span>观众 userId（用于签发 UserSig）</span>
          <input v-model.trim="guestUserId" type="text" autocomplete="off" />
        </label>

        <p v-if="gateError" class="msg msg--err">{{ gateError }}</p>

        <div class="gate__actions">
          <button type="button" class="btn btn--primary" :disabled="busy" @click="doJoin">
            {{ busy ? '进房中…' : '进入直播间' }}
          </button>
        </div>

        <nav class="gate__links" aria-label="其它入口">
          <RouterLink class="link" to="/admin">管理台</RouterLink>
          <RouterLink class="link" to="/legacy">历史调试页</RouterLink>
        </nav>
      </main>
    </template>

    <template v-else>
      <div class="live-shell">
        <header class="live-bar">
          <span class="live-bar__id">{{ joinedLiveId }}</span>
          <button type="button" class="btn btn--ghost" :disabled="busy" @click="doLeave">
            {{ busy ? '…' : '离开' }}
          </button>
        </header>
        <p v-if="trtcError" class="banner banner--err">{{ trtcError }}</p>
        <p v-if="roomResolveError" class="banner banner--err">{{ roomResolveError }}</p>
        <div class="live-body">
          <div ref="stageRef" class="live-stage" />
          <p v-if="!hasRemoteVideo" class="live-overlay">等待主播或数字人画面…</p>
        </div>

        <section class="comment-dock">
          <h2 class="comment-dock__title">发送评论（先审后发）</h2>
          <p class="comment-dock__hint">
            提交后进入待审队列，由主播在控制台选择是否公区展示或送入数字人；此处<strong>不会</strong>立刻出现在下方公区。
          </p>
          <div class="comment-compose">
            <textarea
              v-model.trim="audienceCommentDraft"
              class="comment-textarea"
              rows="2"
              maxlength="2000"
              placeholder="输入想说的话…"
              :disabled="!roomInternalId || commentSubmitting"
            />
            <button
              type="button"
              class="btn btn--primary comment-send"
              :disabled="!roomInternalId || commentSubmitting || !audienceCommentDraft.trim()"
              @click="submitPendingComment"
            >
              {{ commentSubmitting ? '提交中…' : '提交审核' }}
            </button>
          </div>
          <p v-if="commentToast" class="comment-toast">{{ commentToast }}</p>

          <h3 class="comment-dock__subtitle">公区（仅展示主播已「公区显示」的消息）</h3>
          <ul class="public-list">
            <li v-for="m in publicMessages" :key="m.id" class="public-row">
              <span class="public-user">{{ m.senderLabel }}</span>
              <span class="public-text">{{ m.text }}</span>
            </li>
          </ul>
          <p v-if="!publicMessages.length" class="public-empty">暂无公区消息</p>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrtcStage } from '../utils/useTrtcStage.js'

function normalizeEnvSdk() {
  const raw = import.meta.env.VITE_TRTC_SDK_APP_ID
  if (raw == null) return ''
  return String(raw)
    .replace(/^["']|["']$/g, '')
    .trim()
}

const route = useRoute()
const router = useRouter()

const { stageRef, errorMessage: trtcError, hasRemoteVideo, enterRoom, exitRoom } = useTrtcStage()

const liveIdInput = ref(String(route.query.liveId || ''))
const sdkAppIdInput = ref(normalizeEnvSdk())
const guestUserId = ref(`viewer_${Math.random().toString(36).slice(2, 10)}`)

const joined = ref(false)
const joinedLiveId = ref('')
const busy = ref(false)
const gateError = ref('')

const roomInternalId = ref('')
const roomResolveError = ref('')
const audienceCommentDraft = ref('')
const commentSubmitting = ref(false)
const commentToast = ref('')
const publicMessages = ref([])
let publicPollTimer = null

watch(
  () => route.query.liveId,
  (v) => {
    if (!joined.value && v != null) liveIdInput.value = String(v)
  },
)

async function resolveRoomInternalId(liveId) {
  roomResolveError.value = ''
  const r = await fetch(`/api/rooms?liveId=${encodeURIComponent(liveId)}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || r.statusText)
  if (!j.room?.id) throw new Error('接口未返回 room.id')
  roomInternalId.value = j.room.id
}

async function pollPublicMessages() {
  if (!roomInternalId.value) return
  try {
    const r = await fetch(`/api/rooms/${roomInternalId.value}/audience/public-messages`)
    const j = await r.json()
    if (r.ok) publicMessages.value = j.items || []
  } catch {
    /* noop */
  }
}

async function submitPendingComment() {
  if (!roomInternalId.value) return
  const text = audienceCommentDraft.value.trim()
  if (!text) return
  commentSubmitting.value = true
  commentToast.value = ''
  try {
    const r = await fetch(`/api/rooms/${roomInternalId.value}/audience/pending-comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sender_label: guestUserId.value.trim() || '观众' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    audienceCommentDraft.value = ''
    commentToast.value = '已提交审核，请等待主播处理。'
    setTimeout(() => {
      commentToast.value = ''
    }, 4000)
  } catch (e) {
    commentToast.value = e?.message || String(e)
  } finally {
    commentSubmitting.value = false
  }
}

async function doJoin() {
  gateError.value = ''
  const liveId = liveIdInput.value.trim()
  if (!liveId) {
    gateError.value = '请填写直播间 ID（liveId）。'
    return
  }
  const sdkAppId = Number(sdkAppIdInput.value.trim())
  if (!Number.isFinite(sdkAppId) || sdkAppId <= 0) {
    gateError.value = '请填写有效 SDKAppID，或在 .env 中配置 VITE_TRTC_SDK_APP_ID。'
    return
  }
  const userId = guestUserId.value.trim() || `viewer_${Date.now()}`
  busy.value = true
  try {
    const sigRes = await fetch('/api/usersig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const sigJson = await sigRes.json().catch(() => ({}))
    if (!sigRes.ok) throw new Error(sigJson.error || sigRes.statusText)

    await resolveRoomInternalId(liveId)

    joinedLiveId.value = liveId
    joined.value = true
    await router.replace({ path: '/', query: { ...route.query, liveId } })

    await enterRoom({
      sdkAppId,
      userId,
      userSig: sigJson.userSig,
      strRoomId: liveId,
      role: 'audience',
    })

    await pollPublicMessages()
    publicPollTimer = setInterval(pollPublicMessages, 2500)
  } catch (e) {
    gateError.value = e?.message || String(e)
    roomResolveError.value = roomInternalId.value ? '' : e?.message || String(e)
    joined.value = false
    joinedLiveId.value = ''
    roomInternalId.value = ''
  } finally {
    busy.value = false
  }
}

async function doLeave() {
  busy.value = true
  if (publicPollTimer) {
    clearInterval(publicPollTimer)
    publicPollTimer = null
  }
  try {
    await exitRoom()
    joined.value = false
    joinedLiveId.value = ''
    roomInternalId.value = ''
    publicMessages.value = []
    audienceCommentDraft.value = ''
    commentToast.value = ''
    roomResolveError.value = ''
  } finally {
    busy.value = false
  }
}

onUnmounted(() => {
  if (publicPollTimer) clearInterval(publicPollTimer)
  if (joined.value) exitRoom().catch(() => {})
})
</script>

<style scoped>
.audience {
  min-height: 100dvh;
  min-height: 100vh;
}

.gate {
  max-width: 22rem;
  margin: 0 auto;
  padding: max(20px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom));
}

.gate__title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 700;
}

.gate__hint {
  margin: 0 0 18px;
  font-size: 0.88rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.72);
}

.gate__hint--soft {
  color: rgba(255, 210, 160, 0.92);
  font-size: 0.82rem;
}

.gate__hint code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.85em;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.58);
}

.field input {
  padding: 12px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 1rem;
}

.field input:focus {
  outline: none;
  border-color: rgba(126, 184, 255, 0.65);
}

.gate__actions {
  margin-top: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 18px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  width: 100%;
  border-color: transparent;
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
}

.btn--ghost {
  padding: 8px 14px;
  font-size: 0.82rem;
  font-weight: 600;
}

.msg {
  margin: 0 0 12px;
  font-size: 0.85rem;
}

.msg--err {
  color: #ff9b9b;
}

.gate__links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 22px;
  font-size: 0.88rem;
}

.link {
  color: #9ad4ff;
}

.live-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  min-height: 100vh;
  background: #000;
}

.live-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  padding-top: max(10px, env(safe-area-inset-top));
  background: rgba(15, 18, 28, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 20;
}

.live-bar__id {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 14px;
  font-size: 0.82rem;
  text-align: center;
  background: rgba(220, 38, 38, 0.25);
  color: #fecaca;
}

.banner--err {
  background: rgba(180, 40, 40, 0.35);
}

.live-body {
  position: relative;
  flex: 1;
  min-height: 0;
  min-height: min(42vh, 320px);
  display: flex;
  flex-direction: column;
}

.live-stage {
  flex: 1;
  min-height: 0;
  background: #000;
  width: 100%;
}

.live-overlay {
  position: absolute;
  inset: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.55);
}

.comment-dock {
  flex: 0 0 auto;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 14, 22, 0.98);
  padding: 12px 14px max(16px, env(safe-area-inset-bottom));
  max-height: 48vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.comment-dock__title {
  margin: 0 0 6px;
  font-size: 0.92rem;
}

.comment-dock__subtitle {
  margin: 12px 0 6px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.72);
}

.comment-dock__hint {
  margin: 0 0 10px;
  font-size: 0.75rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.55);
}

.comment-compose {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.comment-textarea {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 0.88rem;
  resize: none;
}

.comment-textarea:focus {
  outline: none;
  border-color: rgba(126, 184, 255, 0.55);
}

.comment-send {
  flex: 0 0 auto;
  width: auto;
  padding-left: 16px;
  padding-right: 16px;
}

.comment-toast {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: rgba(160, 230, 180, 0.95);
}

.public-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.public-row {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.82rem;
  line-height: 1.45;
}

.public-user {
  flex: 0 0 auto;
  max-width: 32%;
  color: rgba(180, 220, 255, 0.95);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-text {
  flex: 1;
  min-width: 0;
  color: rgba(255, 255, 255, 0.88);
  word-break: break-word;
}

.public-empty {
  margin: 0;
  padding: 8px 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
}
</style>

<style>
.live-stage > div,
.live-stage video {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  background: #000;
}
</style>
