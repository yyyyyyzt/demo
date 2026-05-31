<template>
  <div class="studio">
    <header class="studio__head">
      <RouterLink class="back" to="/admin">← 管理台</RouterLink>
      <h1 class="studio__title">播控台 · 数字人直播</h1>
      <p v-if="room" class="studio__meta">
        {{ room.title }} · <code>{{ room.liveId }}</code>
      </p>
      <p v-if="err" class="err">{{ err }}</p>
      <div class="studio__toolbar">
        <button
          v-if="!liveActive"
          type="button"
          class="btn btn--primary"
          :disabled="busy || loading"
          @click="onStartLive"
        >
          {{ busy ? '启动中…' : '开始数字人播报直播' }}
        </button>
        <button v-else type="button" class="btn btn--danger" :disabled="busy" @click="onStopLive">
          {{ busy ? '结束中…' : '结束直播' }}
        </button>
        <button type="button" class="btn" :disabled="!liveActive || injecting" @click="onInjectComment">
          {{ injecting ? '注入中…' : '注入测试评论' }}
        </button>
      </div>
    </header>

    <p v-if="loading" class="muted">加载房间…</p>

    <div v-else-if="room" class="studio__grid">
      <section class="col col--comments">
        <h2 class="col__title">评论列表</h2>
        <p v-if="!comments.length" class="muted small">暂无评论，点击「注入测试评论」供演示。</p>
        <ul class="comment-list">
          <li
            v-for="c in comments"
            :key="c.id"
            class="comment-row"
            :class="{ 'comment-row--selected': selectedId === c.id }"
            @click="selectComment(c)"
          >
            <div class="comment-row__head">
              <span class="comment-row__user">{{ c.senderLabel }}</span>
              <span class="comment-row__time">{{ formatShortTime(c.createdAt) }}</span>
              <span class="badge" :data-status="c.status">{{ statusLabel(c.status) }}</span>
            </div>
            <p class="comment-row__text">{{ c.text }}</p>
            <div class="comment-row__actions" @click.stop>
              <button
                type="button"
                class="btn btn--sm"
                :disabled="rowBusy === c.id"
                @click="onGenerateReply(c)"
              >
                {{ rowBusy === c.id ? '…' : '生成回复' }}
              </button>
              <button
                type="button"
                class="btn btn--sm btn--primary"
                :disabled="!canBroadcast(c) || rowBusy === `${c.id}-bc`"
                @click="onBroadcast(c)"
              >
                {{ rowBusy === `${c.id}-bc` ? '…' : '播报' }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="col col--stage">
        <h2 class="col__title">数字人预览</h2>
        <div class="stage-host">
          <div ref="stageRef" class="stage" />
          <p v-if="!hasRemoteVideo" class="stage-overlay">
            {{ trtcEntered ? '等待数字人进房推流…' : '开始直播后将自动进入 TRTC 预览' }}
          </p>
        </div>
        <div class="session-bar">
          <p>
            直播状态：<strong>{{ session.broadcastStatus || 'idle' }}</strong>
            · Session：<code>{{ session.ivhSessionId || '—' }}</code>
          </p>
          <p v-if="session.ivhVirtualmanUserId" class="muted small">
            远端 userId：<code>{{ session.ivhVirtualmanUserId }}</code>
          </p>
          <p v-if="session.job?.status" class="muted small">
            任务：<code>{{ session.job.status }}</code>
            <span v-if="session.job.ivhSessionKeptOpen"> · 会话保持</span>
          </p>
          <p v-if="statusHint" class="hint">{{ statusHint }}</p>
        </div>

        <div v-if="selectedComment" class="reply-box">
          <h3 class="reply-box__title">回复编辑 · {{ selectedComment.senderLabel }}</h3>
          <p class="muted small">原文：{{ selectedComment.text }}</p>
          <textarea
            v-model="replyDraft"
            class="reply-textarea"
            rows="5"
            placeholder="点击「生成回复」或手动输入播报文案"
            @blur="onSaveDraft"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTrtcStage } from '../utils/useTrtcStage.js'

const route = useRoute()
const roomId = computed(() => route.params.roomId)

const {
  stageRef,
  status: trtcStatus,
  hasRemoteVideo,
  enterRoom,
  exitRoom,
} = useTrtcStage()

const trtcEntered = computed(() => trtcStatus.value === 'entered')

const room = ref(null)
const loading = ref(true)
const err = ref('')
const busy = ref(false)
const injecting = ref(false)
const rowBusy = ref('')

const comments = ref([])
const selectedId = ref(null)
const replyDraft = ref('')
const session = ref({
  active: false,
  broadcastStatus: 'idle',
  ivhSessionId: null,
  ivhVirtualmanUserId: null,
  job: null,
})
const statusHint = ref('')

let pollTimer = null

const liveActive = computed(() => session.value.broadcastStatus === 'live' || session.value.active)

const selectedComment = computed(() => comments.value.find((c) => c.id === selectedId.value) || null)

const INJECT_SAMPLES = [
  '主播你好，今天有什么优惠活动吗？',
  '请问这款产品的保修期是多久？',
  '能再介绍一下核心功能吗？',
]

function formatShortTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

function statusLabel(st) {
  const map = { pending: '待处理', ready: '已生成', broadcasted: '已播报' }
  return map[st] || st
}

function canBroadcast(c) {
  return liveActive.value && (c.status === 'ready' || Boolean(c.replyDraft?.trim()))
}

function selectComment(c) {
  selectedId.value = c.id
  replyDraft.value = c.replyDraft || ''
}

async function loadRoom() {
  loading.value = true
  err.value = ''
  try {
    const r = await fetch(`/api/rooms/${roomId.value}`)
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    room.value = j
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function refreshComments() {
  if (!room.value) return
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/comments`)
    const j = await r.json()
    if (r.ok) comments.value = j.items || []
  } catch {
    /* noop */
  }
}

async function refreshSession() {
  if (!room.value) return
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/session`)
    const j = await r.json()
    if (r.ok) session.value = j
  } catch {
    /* noop */
  }
}

async function ensureTrtcPreview() {
  if (trtcEntered.value || !room.value) return
  const tokRes = await fetch(`/api/rooms/${room.value.id}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'anchor' }),
  })
  const tok = await tokRes.json()
  if (!tokRes.ok) throw new Error(tok.error || tokRes.statusText)
  await enterRoom({
    sdkAppId: tok.sdkAppId,
    userId: tok.userId,
    userSig: tok.userSig,
    strRoomId: tok.liveId,
    role: 'anchor',
  })
}

async function onStartLive() {
  if (!room.value) return
  busy.value = true
  statusHint.value = ''
  err.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    statusHint.value = j.placeholder
      ? '未配置 IVH，使用占位模式（无真实推流）'
      : j.reused
        ? '已复用现有数智人会话'
        : '数智人会话已建立，欢迎语已播报'
    await ensureTrtcPreview()
    await refreshSession()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}

async function onStopLive() {
  if (!room.value) return
  busy.value = true
  err.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/stop`, { method: 'POST' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await exitRoom()
    statusHint.value = '直播已结束'
    await refreshSession()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}

async function onInjectComment() {
  if (!room.value) return
  injecting.value = true
  const text = INJECT_SAMPLES[Math.floor(Math.random() * INJECT_SAMPLES.length)]
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sender_label: '演示观众' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await refreshComments()
    selectComment(j)
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    injecting.value = false
  }
}

async function onGenerateReply(c) {
  if (!room.value) return
  rowBusy.value = c.id
  try {
    const r = await fetch(
      `/api/rooms/${room.value.id}/studio/comments/${c.id}/generate-reply`,
      { method: 'POST' },
    )
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await refreshComments()
    const updated = comments.value.find((x) => x.id === c.id)
    if (updated) {
      selectComment(updated)
      statusHint.value = j.source === 'llm' ? 'LLM 已生成回复' : '占位回复已生成'
    }
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    rowBusy.value = ''
  }
}

async function onSaveDraft() {
  if (!room.value || !selectedComment.value) return
  const draft = replyDraft.value
  if (draft === (selectedComment.value.replyDraft || '')) return
  try {
    await fetch(`/api/rooms/${room.value.id}/studio/comments/${selectedComment.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply_draft: draft }),
    })
    await refreshComments()
  } catch {
    /* noop */
  }
}

async function onBroadcast(c) {
  if (!room.value) return
  const text = selectedId.value === c.id ? replyDraft.value.trim() : (c.replyDraft || '').trim()
  if (!text) {
    err.value = '请先填写或生成回复文案'
    return
  }
  rowBusy.value = `${c.id}-bc`
  err.value = ''
  try {
    const r = await fetch(
      `/api/rooms/${room.value.id}/studio/comments/${c.id}/broadcast`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
    )
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    statusHint.value = '播报成功'
    await refreshComments()
    await refreshSession()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    rowBusy.value = ''
  }
}

watch(roomId, () => {
  loadRoom()
})

onMounted(async () => {
  await loadRoom()
  await refreshComments()
  await refreshSession()
  if (liveActive.value) await ensureTrtcPreview()
  pollTimer = setInterval(() => {
    refreshComments()
    refreshSession()
  }, 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  exitRoom()
})
</script>

<style scoped>
.studio {
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px 20px 40px;
}
.studio__head {
  margin-bottom: 16px;
}
.studio__title {
  margin: 8px 0 4px;
  font-size: 1.35rem;
}
.studio__meta {
  color: #555;
  margin: 0 0 12px;
}
.studio__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.studio__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .studio__grid {
    grid-template-columns: 1fr;
  }
}
.col {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  padding: 14px 16px;
}
.col__title {
  margin: 0 0 12px;
  font-size: 1rem;
}
.comment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 520px;
  overflow-y: auto;
}
.comment-row {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
}
.comment-row--selected {
  border-color: #1677ff;
  background: #f0f7ff;
}
.comment-row__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.comment-row__user {
  font-weight: 600;
}
.comment-row__time {
  color: #999;
  font-size: 12px;
}
.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f5f5f5;
}
.badge[data-status='ready'] {
  background: #e6f4ff;
  color: #1677ff;
}
.badge[data-status='broadcasted'] {
  background: #f6ffed;
  color: #389e0d;
}
.comment-row__text {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.45;
}
.comment-row__actions {
  display: flex;
  gap: 6px;
}
.stage-host {
  position: relative;
  background: #111;
  border-radius: 8px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.stage {
  width: 100%;
  height: 100%;
}
.stage-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 14px;
  pointer-events: none;
  text-align: center;
  padding: 12px;
}
.session-bar {
  margin-top: 12px;
  font-size: 13px;
}
.reply-box {
  margin-top: 16px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}
.reply-box__title {
  margin: 0 0 8px;
  font-size: 14px;
}
.reply-textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  resize: vertical;
}
.back {
  color: #1677ff;
  text-decoration: none;
  font-size: 14px;
}
.btn {
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 14px;
}
.btn--primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}
.btn--danger {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: #fff;
}
.btn--sm {
  padding: 4px 10px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.err {
  color: #cf1322;
}
.muted {
  color: #888;
}
.small {
  font-size: 12px;
}
.hint {
  color: #666;
  font-size: 12px;
  margin-top: 6px;
}
</style>
