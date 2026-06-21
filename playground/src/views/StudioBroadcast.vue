<template>
  <div class="studio">
    <header class="studio__head">
      <RouterLink class="back" to="/admin">← 管理台</RouterLink>
      <h1 class="studio__title">
        评论播控台 · 数字人直播
        <span v-if="modName" class="mod-tag">管理员 {{ modName }}</span>
      </h1>
      <p v-if="room" class="studio__meta">{{ room.title }} · <code>{{ room.liveId }}</code></p>
      <p v-if="err" class="err">{{ err }}</p>
      <div class="studio__toolbar">
        <button
          v-if="!liveActive"
          type="button"
          class="btn btn--primary"
          :disabled="busy || loading"
          @click="onStartLive"
        >
          {{ busy ? '启动中…' : '开始直播（生产 · OBS 拉流转推）' }}
        </button>
        <button v-else type="button" class="btn btn--danger" :disabled="busy" @click="onStopLive">
          {{ busy ? '结束中…' : '结束直播' }}
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="injecting"
          @click="onInjectComment"
        >
          {{ injecting ? '注入中…' : '注入测试评论' }}
        </button>
        <span v-if="statusHint" class="hint">{{ statusHint }}</span>
      </div>
    </header>

    <p v-if="loading" class="muted">加载房间…</p>

    <div v-else-if="room" class="studio__grid">
      <!-- 左：评论流 -->
      <section class="col col--comments">
        <h2 class="col__title">
          评论区
          <span v-if="!imConfigured" class="col__sub">（IM 未配置，撤回/禁言为本地标记）</span>
        </h2>
        <p v-if="!comments.length" class="muted small">暂无评论，点击「注入测试评论」演示。</p>
        <ul class="comment-list">
          <li
            v-for="c in comments"
            :key="c.id"
            class="comment-row"
            :class="{
              'comment-row--selected': selectedId === c.id,
              'comment-row--recalled': c.recalled,
            }"
            @click="selectComment(c)"
          >
            <div class="comment-row__head">
              <span class="comment-row__user">{{ c.senderLabel }}</span>
              <span class="comment-row__time">{{ formatShortTime(c.createdAt) }}</span>
              <span class="badge" :data-status="c.status">{{ statusLabel(c.status) }}</span>
              <span v-if="c.claimedBy" class="badge badge--claim">{{ c.claimedBy }} 处理中</span>
              <span v-if="c.muted" class="badge badge--mute">已禁言</span>
            </div>
            <p class="comment-row__text">{{ c.text }}</p>
            <div class="comment-row__actions" @click.stop>
              <button
                type="button"
                class="btn btn--sm btn--primary"
                :disabled="c.recalled || rowBusy === c.id"
                @click="onGenerateReply(c)"
              >
                {{ rowBusy === c.id ? '…' : '模型回复' }}
              </button>
              <button
                type="button"
                class="btn btn--sm"
                :disabled="c.recalled || rowBusy === `${c.id}-rc`"
                @click="onRecall(c)"
              >
                撤回
              </button>
              <button
                type="button"
                class="btn btn--sm btn--warn"
                :disabled="rowBusy === `${c.id}-mt`"
                @click="onMute(c)"
              >
                禁言
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- 中：模型回复二次加工 -->
      <section class="col col--editor">
        <h2 class="col__title">回复编辑 → 播报</h2>
        <template v-if="selectedComment">
          <p class="editor-origin">
            <span class="editor-origin__user">{{ selectedComment.senderLabel }}：</span>
            {{ selectedComment.text }}
          </p>
          <textarea
            v-model="replyDraft"
            class="reply-textarea"
            rows="8"
            placeholder="点击「模型回复」生成话术，可二次加工后再播报"
            @blur="onSaveDraft"
          />
          <div class="editor-actions">
            <button
              type="button"
              class="btn btn--sm"
              :disabled="rowBusy === selectedComment.id"
              @click="onGenerateReply(selectedComment)"
            >
              重新生成
            </button>
            <button
              type="button"
              class="btn btn--primary"
              :disabled="!canBroadcast || broadcasting"
              @click="onBroadcast"
            >
              {{ broadcasting ? '播报中…' : '播报给数字人' }}
            </button>
          </div>
          <p v-if="replySourceHint" class="muted small">{{ replySourceHint }}</p>
          <p v-if="!liveActive" class="hint">播报前需先「开始直播」建立数智人会话。</p>
        </template>
        <p v-else class="muted small">从左侧选择一条评论开始处理。</p>
      </section>

      <!-- 右：预览 + OBS 地址 -->
      <section class="col col--stage">
        <h2 class="col__title">直播预览</h2>
        <div class="stage-host">
          <div ref="stageRef" class="stage" />
          <p v-if="!hasRemoteVideo" class="stage-overlay">
            {{ previewEntered ? '等待画面…（生产模式需 OBS 推流后可见）' : '开始直播后建立预览' }}
          </p>
        </div>
        <div class="session-bar">
          <p>状态：<strong>{{ session.broadcastStatus || 'idle' }}</strong> · 模式：<code>{{ session.mode || obs.mode || '—' }}</code></p>
          <p v-if="session.ivhSessionId" class="muted small">Session：<code>{{ session.ivhSessionId }}</code></p>
          <p v-if="previewError" class="err small">预览：{{ previewError }}</p>
        </div>

        <div v-if="obs.active" class="obs-panel">
          <h3 class="obs-panel__title">OBS 拉流转推地址</h3>
          <p v-if="obs.seat" class="seat-status" :class="{ 'seat-status--ok': obs.seat.onSeat }">
            {{
              obs.seat.onSeat
                ? '✓ 推流机器人已上麦：管理后台与官方观众端可见'
                : `推流机器人未上麦：${obs.seat.error || '未配置 TUILiveKit 管理员'}（仅 demo 预览可见）`
            }}
          </p>
          <div class="obs-field">
            <label>① 拉流地址（OBS 媒体源输入 · 数字人原始画面）</label>
            <div class="obs-copy">
              <code>{{ obs.pullStreamAddr || obs.pullStreamFlv || '（未配置 IVH，占位）' }}</code>
              <button type="button" class="btn btn--sm" @click="copy(obs.pullStreamFlv || obs.pullStreamAddr)">复制</button>
            </div>
            <p v-if="obs.pullStreamFlv" class="muted xsmall">FLV：{{ obs.pullStreamFlv }}</p>
          </div>
          <div class="obs-field">
            <label>② 推流地址（OBS 推流输出 · 抠像/装修后推回直播间）</label>
            <div class="obs-copy">
              <code>{{ obs.pushUrl }}</code>
              <button type="button" class="btn btn--sm" @click="copy(obs.pushUrl)">复制</button>
            </div>
            <p class="muted xsmall">备用域名：{{ obs.backupPushUrl }}</p>
          </div>
          <p class="muted xsmall">
            流程：OBS 拉「①」→ 抠像/虚拟背景/装修 → 推「②」→ 观众端
            <code>/live/{{ room.liveId }}</code> 可见。
          </p>
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
const modName = computed(() => {
  const m = String(route.query.mod || '').toLowerCase()
  return m === 'a' || m === 'b' ? m.toUpperCase() : ''
})
const modSlot = computed(() => modName.value.toLowerCase())

const {
  stageRef,
  status: previewStatus,
  errorMessage: previewError,
  hasRemoteVideo,
  enterRoom: enterPreviewRoom,
  exitRoom: exitPreviewRoom,
} = useTrtcStage()

const previewEntered = computed(() => previewStatus.value === 'entered')

const room = ref(null)
const loading = ref(true)
const err = ref('')
const busy = ref(false)
const injecting = ref(false)
const broadcasting = ref(false)
const rowBusy = ref('')
const statusHint = ref('')
const replySourceHint = ref('')
const imConfigured = ref(true)

const comments = ref([])
const selectedId = ref(null)
const replyDraft = ref('')
const obs = ref({ active: false })
const session = ref({ active: false, broadcastStatus: 'idle', mode: null, ivhSessionId: null })

let pollTimer = null

const liveActive = computed(() => session.value.broadcastStatus === 'live' || session.value.active)
const selectedComment = computed(() => comments.value.find((c) => c.id === selectedId.value) || null)
const canBroadcast = computed(() => Boolean(replyDraft.value.trim()))

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
  return { pending: '待处理', ready: '已生成', broadcasted: '已播报', recalled: '已撤回' }[st] || st
}
function selectComment(c) {
  selectedId.value = c.id
  replyDraft.value = c.replyDraft || ''
  replySourceHint.value = ''
}
async function copy(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(String(text))
    statusHint.value = '已复制到剪贴板'
  } catch {
    statusHint.value = '复制失败，请手动选择'
  }
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
    if (r.ok) {
      comments.value = j.items || []
      imConfigured.value = j.imConfigured !== false
    }
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
async function refreshObs() {
  if (!room.value) return
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/obs-endpoints`)
    const j = await r.json()
    if (r.ok) obs.value = j
  } catch {
    /* noop */
  }
}

async function ensurePreviewRoom() {
  if (previewEntered.value || !room.value) return
  const tokRes = await fetch(`/api/rooms/${room.value.id}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'preview' }),
  })
  const tok = await tokRes.json()
  if (!tokRes.ok) throw new Error(tok.error || tokRes.statusText)
  await enterPreviewRoom({
    sdkAppId: tok.sdkAppId,
    userId: tok.userId,
    userSig: tok.userSig,
    strRoomId: tok.liveId,
    role: 'audience',
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
      body: JSON.stringify({ mode: 'production' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    if (j.obs) obs.value = j.obs
    statusHint.value = j.placeholder
      ? '未配置 IVH：占位模式（地址为示例，无真实流）'
      : '数智人会话已建立，复制 OBS 地址开始拉流转推'
    await refreshSession()
    await ensurePreviewRoom()
  } catch (e) {
    err.value = e?.message || String(e)
    await exitPreviewRoom().catch(() => {})
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
    await exitPreviewRoom()
    obs.value = { active: false }
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
  const samples = [
    '这个政策外地户籍能享受吗？',
    '补贴大概多久能到账呀？',
    '线下办理地点在哪里？周末上班吗？',
  ]
  const text = samples[Math.floor(Math.random() * samples.length)]
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
    const r = await fetch(`/api/rooms/${room.value.id}/studio/comments/${c.id}/generate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: modSlot.value }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await refreshComments()
    const updated = comments.value.find((x) => x.id === c.id)
    if (updated) {
      selectComment(updated)
      replySourceHint.value = j.source === 'llm' ? '已由 LLM 生成话术' : '已生成占位话术（未配置 LLM）'
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

async function onBroadcast() {
  if (!room.value || !selectedComment.value) return
  const text = replyDraft.value.trim()
  if (!text) {
    err.value = '请先填写或生成回复文案'
    return
  }
  broadcasting.value = true
  err.value = ''
  try {
    const r = await fetch(
      `/api/rooms/${room.value.id}/studio/comments/${selectedComment.value.id}/broadcast`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
    )
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    statusHint.value = j.placeholder ? '已播报（占位模式）' : '播报成功，数字人开始播报'
    await refreshComments()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    broadcasting.value = false
  }
}

async function onRecall(c) {
  if (!room.value) return
  rowBusy.value = `${c.id}-rc`
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/comments/${c.id}/recall`, {
      method: 'POST',
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    statusHint.value = j.im?.recalled
      ? '已从 IM 撤回该评论'
      : `已标记撤回（IM 未撤回：${j.im?.reason || '—'}）`
    await refreshComments()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    rowBusy.value = ''
  }
}

async function onMute(c) {
  if (!room.value) return
  rowBusy.value = `${c.id}-mt`
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/studio/comments/${c.id}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds: 600 }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    statusHint.value = j.im?.muted ? '已禁言该用户 10 分钟' : `禁言未生效：${j.im?.reason || '—'}`
    await refreshComments()
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    rowBusy.value = ''
  }
}

watch(roomId, () => loadRoom())

onMounted(async () => {
  await loadRoom()
  await refreshComments()
  await refreshSession()
  await refreshObs()
  if (liveActive.value) await ensurePreviewRoom().catch(() => {})
  pollTimer = setInterval(async () => {
    await refreshComments()
    await refreshSession()
    if (liveActive.value && !previewEntered.value) await ensurePreviewRoom().catch(() => {})
  }, 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  exitPreviewRoom()
})
</script>

<style scoped>
.studio {
  max-width: 1480px;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 20px max(40px, env(safe-area-inset-bottom));
}
.studio__head {
  margin-bottom: 16px;
}
.studio__title {
  margin: 8px 0 4px;
  font-size: 1.35rem;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.mod-tag {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(79, 141, 255, 0.25);
  color: #9ad4ff;
}
.studio__meta {
  color: rgba(255, 255, 255, 0.65);
  margin: 0 0 12px;
  font-size: 0.9rem;
}
.studio__meta code {
  color: #b8e0ff;
}
.studio__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.studio__grid {
  display: grid;
  /* minmax(0, …) 锁定三列宽度，避免长地址/视频画布把 fr 轨道撑大导致列宽漂移 */
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .studio__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.col {
  min-width: 0;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 14px 16px;
}
.col__title {
  margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 600;
}
.col__sub {
  font-size: 0.72rem;
  color: rgba(255, 200, 120, 0.8);
  font-weight: 400;
}
.comment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 70vh;
  overflow-y: auto;
}
.comment-row {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.03);
}
.comment-row--selected {
  border-color: rgba(79, 141, 255, 0.65);
  background: rgba(79, 141, 255, 0.12);
}
.comment-row--recalled {
  opacity: 0.5;
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
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
}
.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);
}
.badge[data-status='ready'] {
  background: rgba(79, 141, 255, 0.25);
  color: #9ad4ff;
}
.badge[data-status='broadcasted'] {
  background: rgba(82, 196, 26, 0.2);
  color: #b7eb8f;
}
.badge--claim {
  background: rgba(250, 173, 20, 0.2);
  color: #ffd591;
}
.badge--mute {
  background: rgba(255, 77, 79, 0.2);
  color: #ffccc7;
}
.comment-row__text {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.88);
}
.comment-row__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.editor-origin {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 10px;
  margin: 0 0 10px;
}
.editor-origin__user {
  color: #9ad4ff;
}
.reply-textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  resize: vertical;
}
.editor-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.stage-host {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 10px;
  aspect-ratio: 16 / 9;
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
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
  text-align: center;
  padding: 12px;
  z-index: 1;
}
.session-bar {
  margin-top: 12px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
}
.session-bar code {
  color: #b8e0ff;
  font-size: 0.78rem;
  word-break: break-all;
}
.obs-panel {
  margin-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
}
.obs-panel__title {
  margin: 0 0 10px;
  font-size: 14px;
}
.seat-status {
  margin: 0 0 10px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(250, 173, 20, 0.16);
  color: #ffd591;
}
.seat-status--ok {
  background: rgba(82, 196, 26, 0.18);
  color: #b7eb8f;
}
.obs-field {
  margin-bottom: 12px;
}
.obs-field label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 4px;
}
.obs-copy {
  display: flex;
  gap: 8px;
  align-items: center;
}
.obs-copy code {
  flex: 1;
  min-width: 0;
  font-size: 0.72rem;
  color: #b8e0ff;
  word-break: break-all;
  background: rgba(0, 0, 0, 0.4);
  padding: 6px 8px;
  border-radius: 6px;
}
.back {
  color: #9ad4ff;
  text-decoration: none;
  font-size: 14px;
}
.btn {
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 9px 16px;
  cursor: pointer;
  font-size: 0.88rem;
  line-height: 1.2;
}
.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}
.btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
}
.btn--secondary {
  border-color: rgba(154, 212, 255, 0.45);
  background: rgba(79, 141, 255, 0.15);
  color: #d6ebff;
}
.btn--danger {
  border-color: rgba(255, 120, 117, 0.55);
  background: rgba(255, 77, 79, 0.22);
  color: #ffccc7;
}
.btn--warn {
  border-color: rgba(250, 173, 20, 0.5);
  background: rgba(250, 173, 20, 0.16);
  color: #ffd591;
}
.btn--sm {
  padding: 5px 10px;
  font-size: 0.78rem;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.err {
  color: #ff9b9b;
}
.muted {
  color: rgba(255, 255, 255, 0.5);
}
.small {
  font-size: 12px;
}
.xsmall {
  font-size: 11px;
}
.hint {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}
</style>

<style>
.studio .stage > div,
.studio .stage video {
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain !important;
  object-position: center center !important;
  background: #000;
}
</style>
