<template>
  <div class="anchor">
    <header class="anchor__head">
      <RouterLink class="back" to="/admin">← 管理台</RouterLink>
      <h1 class="anchor__title">主播开播</h1>
      <p v-if="room" class="anchor__meta">
        {{ room.title }} · <code>{{ room.liveId }}</code>
      </p>
      <p v-if="err" class="err">{{ err }}</p>
    </header>

    <p v-if="loading" class="muted">加载房间与票据…</p>

    <template v-else-if="room && iframeSrc">
      <section class="panel">
        <p class="hint">
          Canvas 推流在<strong>隐藏</strong>的 iframe 中运行（不展示画面）。请先点「开始推流」，再点「连接评论管理」以同一房间进入
          <code>mod_*</code>
          身份拉取腾讯云 IM 弹幕。停播用「结束推流」。
        </p>
        <div class="push-actions">
          <button type="button" class="btn btn--primary" @click="postStart">开始推流</button>
          <button type="button" class="btn" @click="postStop">结束推流</button>
        </div>
        <div class="iframe-host" aria-hidden="true">
          <iframe ref="iframeRef" class="frame" title="Canvas 推流（隐藏）" :src="iframeSrc" />
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">评论管理（IM 真实弹幕）</h2>
        <p class="hint">与推流账号隔离，避免与 TUIRoomEngine 单例冲突。连接后可查看观众通过弹幕组件发送的文本，并可发起数字人占位任务（后续可接大模型）。</p>
        <div class="mod-actions">
          <button v-if="!modConnected" type="button" class="btn btn--primary" :disabled="modBusy" @click="connectMod">
            {{ modBusy ? '连接中…' : '连接评论管理' }}
          </button>
          <button v-else type="button" class="btn" :disabled="modBusy" @click="disconnectMod">断开评论连接</button>
        </div>
        <p v-if="modErr" class="err">{{ modErr }}</p>
        <p v-if="dhErr" class="err">{{ dhErr }}</p>

        <template v-if="modConnected">
          <p class="muted small">共 {{ messageList.length }} 条（含历史拉取）</p>
          <ul class="msg-list">
            <li v-for="m in messageList" :key="msgKey(m)" class="msg-row">
              <div class="msg-main">
                <span class="msg-user">{{ m.sender?.userName || m.sender?.userId }}</span>
                <span class="msg-text">{{ m.textContent || '（非文本）' }}</span>
              </div>
              <button
                type="button"
                class="btn btn--sm"
                :disabled="dhBusyId === msgKey(m)"
                @click="startDhJob(m)"
              >
                数字人任务
              </button>
            </li>
          </ul>
          <p v-if="!messageList.length" class="muted">暂无弹幕，请在观众端进房后发送。</p>
        </template>
      </section>

      <section class="panel">
        <h2 class="panel__title">数字人输出（占位轮询）</h2>
        <p class="hint">由上方「数字人任务」创建；约 1s 内完成占位流水线。</p>
        <p v-if="dhJob" class="job">
          状态：<strong>{{ dhJob.status }}</strong>
          <span v-if="dhJob.replyText"> · 回复：{{ dhJob.replyText }}</span>
        </p>
        <img v-if="dhJob?.imageUrl" class="dhimg" :src="dhJob.imageUrl" alt="数字人占位图" />
        <p v-else class="muted">暂无已完成任务图像</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  useLoginState,
  useLiveListState,
  useBarrageState,
} from 'tuikit-atomicx-vue3'

const route = useRoute()
const roomId = computed(() => route.params.roomId)

const { login, logout } = useLoginState()
const { joinLive, leaveLive } = useLiveListState()
const { messageList } = useBarrageState()

const room = ref(null)
const loading = ref(true)
const err = ref('')

const iframeRef = ref(null)
const iframeSrc = ref('')

const modConnected = ref(false)
const modBusy = ref(false)
const modErr = ref('')
const dhErr = ref('')

const dhJob = ref(null)
const dhBusyId = ref('')
let pollTimer = null

function msgKey(m) {
  return `${m.sequence}-${m.timestampInSecond}-${m.sender?.userId || ''}`
}

async function load() {
  loading.value = true
  err.value = ''
  room.value = null
  iframeSrc.value = ''
  try {
    const id = roomId.value
    if (!id) throw new Error('缺少房间 id')
    const r1 = await fetch(`/api/rooms/${id}`)
    const j1 = await r1.json()
    if (!r1.ok) throw new Error(j1.error || r1.statusText)
    room.value = j1

    const r2 = await fetch(`/api/rooms/${id}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'anchor' }),
    })
    const j2 = await r2.json()
    if (!r2.ok) throw new Error(j2.error || r2.statusText)

    const params = new URLSearchParams({
      sdkAppId: String(j2.sdkAppId),
      userId: j2.userId,
      userSig: j2.userSig,
      strRoomId: j1.liveId,
      liveTitle: j1.title || 'Demo 直播',
      orientation: 'portrait',
      hidePreview: '1',
    })
    iframeSrc.value = `/minimal-live-broadcast.html?${params.toString()}`
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function postStart() {
  iframeRef.value?.contentWindow?.postMessage({ type: 'tuikit-demo-start-live' }, window.location.origin)
}

function postStop() {
  iframeRef.value?.contentWindow?.postMessage({ type: 'tuikit-demo-stop-live' }, window.location.origin)
}

async function connectMod() {
  if (!room.value) return
  modErr.value = ''
  dhErr.value = ''
  modBusy.value = true
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'moderator' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await login({ sdkAppId: j.sdkAppId, userId: j.userId, userSig: j.userSig })
    await joinLive({ liveId: room.value.liveId })
    modConnected.value = true
  } catch (e) {
    modErr.value = e?.message || String(e)
  } finally {
    modBusy.value = false
  }
}

async function disconnectMod() {
  if (!modConnected.value) return
  modBusy.value = true
  modErr.value = ''
  try {
    await leaveLive()
    await logout()
    modConnected.value = false
  } catch (e) {
    modErr.value = e?.message || String(e)
  } finally {
    modBusy.value = false
  }
}

async function startDhJob(m) {
  if (!room.value || !m?.textContent) return
  const id = msgKey(m)
  dhBusyId.value = id
  dhErr.value = ''
  try {
    const res = await fetch(`/api/rooms/${room.value.id}/digital-human/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment_id: `im_${m.sequence}`,
        comment_text: m.textContent,
      }),
    })
    const job = await res.json()
    if (!res.ok) throw new Error(job.error || res.statusText)
    dhJob.value = job
  } catch (e) {
    dhErr.value = e?.message || String(e)
  } finally {
    dhBusyId.value = ''
  }
}

async function pollDh() {
  const id = roomId.value
  if (!id || !room.value) return
  try {
    const r = await fetch(`/api/rooms/${id}/digital-human/active-job`)
    const j = await r.json()
    if (!r.ok) return
    dhJob.value = j.job
  } catch {
    /* noop */
  }
}

watch(roomId, async () => {
  await disconnectMod()
  dhJob.value = null
  await load()
})

onMounted(() => {
  load()
  pollTimer = setInterval(pollDh, 2000)
})

onUnmounted(async () => {
  if (pollTimer) clearInterval(pollTimer)
  if (modConnected.value) {
    try {
      await leaveLive()
      await logout()
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

.panel__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
}

.hint {
  margin: 0 0 10px;
  font-size: 0.78rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.62);
}

.hint code {
  font-size: 0.72rem;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
}

.push-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.mod-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
}

.btn--sm {
  padding: 4px 10px;
  font-size: 0.72rem;
  flex: 0 0 auto;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.iframe-host {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 1280px;
  height: 720px;
  overflow: hidden;
  opacity: 0.02;
  pointer-events: none;
  z-index: -1;
}

.frame {
  width: 1280px;
  height: 720px;
  border: 0;
  pointer-events: none;
}

.msg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 50vh;
  overflow: auto;
}

.msg-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.85rem;
}

.msg-main {
  flex: 1;
  min-width: 0;
}

.msg-user {
  display: block;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}

.msg-text {
  word-break: break-word;
  color: rgba(255, 255, 255, 0.92);
}

.job {
  font-size: 0.85rem;
  margin: 0 0 10px;
}

.dhimg {
  display: block;
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
}
</style>
