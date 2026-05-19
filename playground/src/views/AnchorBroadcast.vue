<template>
  <div class="anchor">
    <header class="anchor__head">
      <RouterLink class="back" to="/admin">← 管理台</RouterLink>
      <h1 class="anchor__title">主播控制台 · 数字人直播测试</h1>
      <p v-if="room" class="anchor__meta">
        {{ room.title }} · <code>{{ room.liveId }}</code>
      </p>
      <p v-if="err" class="err">{{ err }}</p>
    </header>

    <p v-if="loading" class="muted">加载房间…</p>

    <template v-else-if="room">
      <section class="panel">
        <h2 class="panel__title">两步开播</h2>
        <p class="hint">
          1）<strong>主播开播</strong>：以 <code>anchor_*</code> 用户身份进入 TRTC 直播间，仅作为「监看 / 占位主播」，不推送本地摄像头。<br />
          2）<strong>发起数字人测试</strong>：调用服务端 aPaaS（<code>createsession → startsession → SEND_TEXT</code>）让数智人以另一名 TRTC 用户身份进入同一房间推流。<br />
          3）<strong>模拟观众评论</strong>：在下方输入自定义文案，可替代步骤 ② 的默认首句，或在数字人已就绪后<strong>追加多轮</strong>驱动（类似评论触发）。<br />
          页面通过原生 <code>trtc-sdk-v5</code> 订阅房间内任意远端视频流（<code>REMOTE_VIDEO_AVAILABLE</code>），<strong>因此能直接看到数字人画面</strong>；观众端同理。
        </p>

        <div class="actions">
          <button
            v-if="!trtcEntered"
            type="button"
            class="btn btn--primary"
            :disabled="busy"
            @click="onStartAnchor"
          >
            {{ busy ? '进房中…' : '① 主播开播（进入 TRTC 房间）' }}
          </button>
          <button v-else type="button" class="btn" :disabled="busy" @click="onStopAnchor">
            {{ busy ? '退房中…' : '结束主播开播' }}
          </button>

          <button
            type="button"
            class="btn btn--primary"
            :disabled="!trtcEntered || dhStarting || dhJobActive"
            @click="onStartDh"
          >
            {{ dhStarting ? '提交中…' : '② 发起数字人测试' }}
          </button>
          <button type="button" class="btn" :disabled="!dhJobActive || dhStopping" @click="onStopDh">
            {{ dhStopping ? '停止中…' : '停止数字人' }}
          </button>
        </div>

        <p v-if="trtcError" class="err">{{ trtcError }}</p>
        <p v-if="dhError" class="err">{{ dhError }}</p>
      </section>

      <section class="panel panel--simulate">
        <h2 class="panel__title">③ 模拟观众评论 → 驱动数字人</h2>
        <p class="hint">
          请先完成<strong>① 主播开播</strong>。若尚未发起数字人，可直接用下方文案作为<strong>首条</strong>进房播报；若步骤 ② 已就绪（任务状态为
          <code>image_done</code>），同一文案会走<strong>追加一轮</strong>（<code>speak</code>）。勾选「对话模式」时走云端会话（<code>use_chat</code>），不勾选则按原文 TTS。
        </p>
        <p v-if="apiHealth && apiHealth.dhAllowManualJob === false" class="hint hint--soft">
          当前 API 已关闭手动调试（<code>DH_ALLOW_MANUAL_JOB=0</code>），本节请求将失败；请改环境变量并重启 API。
        </p>
        <label class="sim-field">
          <span class="sim-label">模拟用户评论 / 弹幕内容</span>
          <textarea
            v-model.trim="simulateCommentText"
            class="sim-textarea"
            rows="3"
            maxlength="2000"
            placeholder="例如：主播你好，请问今天有什么福利？"
          />
        </label>
        <label class="sim-check">
          <input v-model="simulateUseChat" type="checkbox" />
          <span>对话模式（云端扩展回复；不勾选则数字人朗读/播报输入原文）</span>
        </label>
        <div class="actions">
          <button
            type="button"
            class="btn btn--primary"
            :disabled="!trtcEntered || simulateSending || !simulateCommentText.trim() || apiHealth?.dhAllowManualJob === false"
            @click="onSimulateComment"
          >
            {{ simulateSending ? '提交中…' : '发送模拟评论并驱动数字人' }}
          </button>
        </div>
        <p v-if="simulateHint" class="muted small">{{ simulateHint }}</p>
      </section>

      <section class="panel panel--pending">
        <h2 class="panel__title">④ 观众待审评论</h2>
        <p class="hint">
          观众在 H5 页点击「提交审核」后，消息只进入此处队列，<strong>不会自动驱动数字人</strong>。你可选择<strong>公区显示</strong>（观众端公区列表可见）、<strong>送入数字人</strong>（排队
          aPaaS 任务）或<strong>忽略</strong>。
        </p>
        <label class="sim-check pending-dh-chat">
          <input v-model="pendingDhUseChat" type="checkbox" />
          <span>送入数字人时使用对话模式（<code>use_chat</code>）</span>
        </label>
        <p v-if="!pendingComments.length" class="muted small">暂无待审；请观众在观众页提交评论。</p>
        <ul v-else class="pending-list">
          <li v-for="p in pendingComments" :key="p.id" class="pending-row">
            <div class="pending-main">
              <span class="pending-user">{{ p.senderLabel }}</span>
              <span class="pending-text">{{ p.text }}</span>
              <span class="pending-time">{{ formatShortTime(p.createdAt) }}</span>
            </div>
            <div class="pending-actions">
              <button
                type="button"
                class="btn btn--sm"
                :disabled="!!pendingActionKey"
                @click="onPendingApproveDisplay(p)"
              >
                {{ pendingActionKey === `${p.id}-pub` ? '…' : '公区显示' }}
              </button>
              <button
                type="button"
                class="btn btn--sm btn--primary"
                :disabled="!!pendingActionKey || !trtcEntered || dhStarting"
                @click="onPendingToDh(p)"
              >
                {{ pendingActionKey === `${p.id}-dh` ? '…' : '送入数字人' }}
              </button>
              <button type="button" class="btn btn--sm btn--ghost" :disabled="!!pendingActionKey" @click="onPendingDismiss(p)">
                {{ pendingActionKey === `${p.id}-del` ? '…' : '忽略' }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel panel--stage">
        <h2 class="panel__title">直播画面（管理员预览）</h2>
        <p class="hint hint--soft">
          以下画面来自房间内任意推流者；数字人就绪后会自动出现在这里。
        </p>
        <div class="stage-host">
          <div ref="stageRef" class="stage" />
          <p v-if="!hasRemoteVideo" class="stage-overlay">
            {{ trtcEntered ? '等待数字人进房推流…' : '请先点「主播开播」进入 TRTC 房间' }}
          </p>
        </div>
        <p v-if="remoteUsers.length" class="muted small">
          房间内远端用户：<code>{{ remoteUsers.join(', ') }}</code>
        </p>
      </section>

      <section v-if="dhJob" class="panel panel--job">
        <h2 class="panel__title">数字人任务状态</h2>
        <p class="job-line">
          状态：<strong>{{ dhJob.status }}</strong>
          <span v-if="dhJob.replyText"> · 驱动文本：{{ dhJob.replyText }}</span>
        </p>
        <p v-if="dhJob.status === 'failed'" class="err">{{ dhJob.ivhError || '任务失败' }}</p>
        <template v-if="dhJob.ivhVirtualmanUserId">
          <p class="muted small">数智人 TRTC UserId</p>
          <pre class="mono">{{ dhJob.ivhVirtualmanUserId }}</pre>
        </template>
        <template v-if="dhJob.ivhSessionId">
          <p class="muted small">SessionId</p>
          <pre class="mono">{{ dhJob.ivhSessionId }}</pre>
        </template>
        <p
          v-if="dhJob.status === 'image_done' && apiHealth && !apiHealth.ivhConfigured"
          class="hint hint--soft"
        >
          当前未配置 <code>IVH_*</code> 环境变量，使用占位演示；填写后重启 API 进程即可走真实数智人。
        </p>
        <p v-if="apiHealth && !apiHealth.hasTrtcSecret" class="hint hint--soft">
          未检测到 <code>TRTC_SDK_APP_ID</code>/<code>TRTC_SECRET_KEY</code>，无法签发 UserSig；请填 <code>.env</code> 后重启 API。
        </p>
      </section>

      <section class="panel panel--share">
        <h2 class="panel__title">把直播分享给观众</h2>
        <p class="hint">观众端打开下方链接（或扫码）即可进入同一直播间。</p>
        <p class="mono mono--wrap">{{ audienceUrl }}</p>
        <RouterLink class="inline-link" :to="{ path: '/', query: { liveId: room.liveId } }" target="_blank"
          >新开窗口预览观众页 →</RouterLink
        >
      </section>
    </template>
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
  errorMessage: trtcError,
  hasRemoteVideo,
  remoteUsers,
  enterRoom,
  exitRoom,
} = useTrtcStage()

const trtcEntered = computed(() => trtcStatus.value === 'entered')

const room = ref(null)
const loading = ref(true)
const err = ref('')
const busy = ref(false)

const dhStarting = ref(false)
const dhStopping = ref(false)
const dhError = ref('')
const dhJob = ref(null)

/** 与 server `dh/start` 默认文案一致；走 `digital-human/manual-job` 以兼容仅代理到旧版 API 或 preview 未配置时的路径习惯 */
const DH_DEFAULT_SCRIPT =
  '欢迎来到直播间，我是数字人主播，下面为大家带来一段精彩的直播测试。'

const simulateCommentText = ref('主播你好，今天直播间有什么看点？')
const simulateUseChat = ref(false)
const simulateSending = ref(false)
const simulateHint = ref('')

const pendingComments = ref([])
const pendingActionKey = ref('')
const pendingDhUseChat = ref(false)

const apiHealth = ref(null)
let pollTimer = null
let healthTimer = null

const dhJobActive = computed(() =>
  Boolean(
    dhJob.value &&
      ['pending', 'llm_done', 'image_done'].includes(dhJob.value.status) &&
      !dhJob.value.ivhClosed,
  ),
)

const canAppendSpeak = computed(
  () =>
    Boolean(
      dhJob.value?.status === 'image_done' &&
        dhJob.value?.ivhSessionId &&
        !dhJob.value?.ivhClosed,
    ),
)

const audienceUrl = computed(() => {
  if (!room.value) return ''
  if (typeof window === 'undefined') return ''
  const url = new URL('/', window.location.origin)
  url.searchParams.set('liveId', room.value.liveId)
  return url.toString()
})

function formatShortTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

async function refreshApiHealth() {
  try {
    const r = await fetch('/api/health')
    const j = await r.json()
    if (r.ok) apiHealth.value = j
  } catch {
    /* noop */
  }
}

async function loadRoom() {
  loading.value = true
  err.value = ''
  room.value = null
  try {
    const id = roomId.value
    if (!id) throw new Error('缺少房间 id')
    const r1 = await fetch(`/api/rooms/${id}`)
    const j1 = await r1.json()
    if (!r1.ok) throw new Error(j1.error || r1.statusText)
    room.value = j1
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function onStartAnchor() {
  if (!room.value) return
  busy.value = true
  dhError.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'anchor' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await enterRoom({
      sdkAppId: j.sdkAppId,
      userId: j.userId,
      userSig: j.userSig,
      strRoomId: room.value.liveId,
      role: 'anchor',
    })
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}

async function onStopAnchor() {
  busy.value = true
  try {
    await exitRoom()
  } finally {
    busy.value = false
  }
}

async function onStartDh() {
  if (!room.value) return
  dhStarting.value = true
  dhError.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/digital-human/manual-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: DH_DEFAULT_SCRIPT, use_chat: false }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    dhJob.value = j
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    dhStarting.value = false
  }
}

async function onStopDh() {
  if (!room.value) return
  dhStopping.value = true
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/digital-human/stop-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    if (j.job) dhJob.value = j.job
    simulateHint.value = ''
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    dhStopping.value = false
  }
}

/** 无活跃会话时走 manual-job；已就绪则 speak 追加一轮 */
async function onSimulateComment() {
  if (!room.value || !trtcEntered.value) return
  const text = simulateCommentText.value.trim()
  if (!text) {
    dhError.value = '请输入模拟评论内容。'
    return
  }
  simulateSending.value = true
  dhError.value = ''
  simulateHint.value = ''
  try {
    if (canAppendSpeak.value) {
      const r = await fetch(`/api/rooms/${room.value.id}/digital-human/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, use_chat: simulateUseChat.value }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || r.statusText)
      dhJob.value = j.job
      simulateHint.value = '已追加一轮驱动（同一会话 speak）。'
    } else if (!dhJobActive.value) {
      const r = await fetch(`/api/rooms/${room.value.id}/digital-human/manual-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, use_chat: simulateUseChat.value }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || r.statusText)
      dhJob.value = j
      simulateHint.value = '已用当前文案创建首条数字人任务。就绪后可继续发送模拟评论追加。'
    } else {
      dhError.value =
        '当前数字人任务仍在执行中，请待状态变为 image_done 后再发送模拟评论；或使用「停止数字人」后重新发起。'
    }
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    simulateSending.value = false
  }
}

async function pollDh() {
  if (!room.value) return
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/digital-human/active-job`)
    const j = await r.json()
    if (!r.ok) return
    if (j.job) dhJob.value = j.job
  } catch {
    /* noop */
  }
}

async function pollPending() {
  if (!room.value) return
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/audience/pending-comments`)
    const j = await r.json()
    if (r.ok) pendingComments.value = j.items || []
  } catch {
    /* noop */
  }
}

async function pollRoomQueues() {
  await pollDh()
  await pollPending()
}

async function onPendingApproveDisplay(item) {
  if (!room.value) return
  const k = `${item.id}-pub`
  pendingActionKey.value = k
  dhError.value = ''
  try {
    const r = await fetch(
      `/api/rooms/${room.value.id}/audience/pending-comments/${encodeURIComponent(item.id)}/approve-display`,
      { method: 'POST' },
    )
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await pollPending()
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    pendingActionKey.value = ''
  }
}

async function onPendingToDh(item) {
  if (!room.value) return
  const k = `${item.id}-dh`
  pendingActionKey.value = k
  dhError.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/digital-human/job-from-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pending_comment_id: item.id, use_chat: pendingDhUseChat.value }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    dhJob.value = j
    await pollPending()
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    pendingActionKey.value = ''
  }
}

async function onPendingDismiss(item) {
  if (!room.value) return
  const k = `${item.id}-del`
  pendingActionKey.value = k
  dhError.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/audience/pending-comments/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await pollPending()
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    pendingActionKey.value = ''
  }
}

watch(roomId, async () => {
  if (trtcEntered.value) await exitRoom()
  dhJob.value = null
  simulateHint.value = ''
  pendingComments.value = []
  await loadRoom()
})

onMounted(() => {
  loadRoom()
  refreshApiHealth()
  pollTimer = setInterval(pollRoomQueues, 2000)
  healthTimer = setInterval(refreshApiHealth, 12000)
})

onUnmounted(async () => {
  if (pollTimer) clearInterval(pollTimer)
  if (healthTimer) clearInterval(healthTimer)
  if (trtcEntered.value) {
    try {
      await exitRoom()
    } catch {
      /* noop */
    }
  }
})
</script>

<style scoped>
.anchor {
  max-width: 52rem;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 12px max(24px, env(safe-area-inset-bottom));
}

.anchor__head {
  margin-bottom: 14px;
}

.back {
  display: inline-block;
  margin-bottom: 8px;
  font-size: 0.88rem;
  color: #9ad4ff;
  text-decoration: none;
}

.anchor__title {
  margin: 0 0 6px;
  font-size: 1.2rem;
}

.anchor__meta {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.72);
}

.anchor__meta code {
  color: #b8e0ff;
  word-break: break-all;
}

.err {
  color: #ff9b9b;
  font-size: 0.85rem;
}

.muted {
  color: rgba(255, 255, 255, 0.55);
}

.muted.small {
  font-size: 0.78rem;
  margin: 8px 0;
}

.panel {
  margin-top: 14px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.28);
}

.panel--stage {
  padding-bottom: 14px;
}

.panel--job {
  border-color: rgba(120, 200, 255, 0.28);
  background: rgba(0, 24, 40, 0.22);
}

.panel--simulate {
  border-color: rgba(200, 160, 255, 0.28);
  background: rgba(28, 0, 40, 0.18);
}

.sim-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.sim-label {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.55);
}

.sim-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 0.88rem;
  line-height: 1.45;
  resize: vertical;
  min-height: 4.2rem;
}

.sim-textarea:focus {
  outline: none;
  border-color: rgba(200, 160, 255, 0.55);
}

.sim-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 0.78rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.68);
  cursor: pointer;
}

.sim-check input {
  margin-top: 3px;
  flex: 0 0 auto;
}

.panel--share {
  border-color: rgba(160, 220, 180, 0.22);
}

.panel__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
}

.hint {
  margin: 0 0 10px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.65);
}

.hint--soft {
  color: rgba(255, 220, 160, 0.88);
}

.hint code {
  font-size: 0.72rem;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
}

.inline-link {
  color: #9ad4ff;
  font-weight: 600;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 6px 0;
}

.btn {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.88rem;
  cursor: pointer;
}

.btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
}

.btn--sm {
  padding: 6px 10px;
  font-size: 0.75rem;
}

.btn--ghost {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.panel--pending {
  border-color: rgba(255, 200, 120, 0.28);
  background: rgba(36, 28, 0, 0.2);
}

.pending-dh-chat {
  margin-bottom: 12px;
}

.pending-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 42vh;
  overflow-y: auto;
}

.pending-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.pending-main {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-size: 0.84rem;
}

.pending-user {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: rgba(180, 220, 255, 0.95);
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-text {
  flex: 1 1 100%;
  min-width: 0;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
}

.pending-time {
  flex: 0 0 auto;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.45);
}

.pending-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.stage-host {
  position: relative;
  width: 100%;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
}

.stage {
  width: 100%;
  height: 100%;
  background: #000;
}

.stage-overlay {
  position: absolute;
  inset: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
  text-align: center;
  padding: 12px;
}

.job-line {
  font-size: 0.85rem;
  margin: 0 0 10px;
}

.mono {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.72rem;
  line-height: 1.45;
  overflow: auto;
  color: rgba(200, 230, 255, 0.95);
}

.mono--wrap {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

<style>
.stage > div,
.stage video {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  background: #000;
}
</style>
