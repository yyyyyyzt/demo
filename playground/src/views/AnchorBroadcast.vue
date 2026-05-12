<template>
  <div class="anchor">
    <header class="anchor__head">
      <RouterLink class="back" to="/admin">← 管理台</RouterLink>
      <h1 class="anchor__title">主播控制台</h1>
      <p v-if="room" class="anchor__meta">
        {{ room.title }} · <code>{{ room.liveId }}</code>
      </p>
      <p v-if="err" class="err">{{ err }}</p>
    </header>

    <p v-if="loading" class="muted">加载房间…</p>

    <template v-else-if="room">
      <section class="panel panel--roadmap">
        <h2 class="panel__title">播出形态：TRTC 房间内唯一视频源（阶段一）</h2>
        <p class="hint">
          已<strong>取消默认 Canvas 自定义视频轨</strong>开播。下一步在服务端对接<strong>腾讯云智能数智人 · 云渲染</strong>（优先
          <strong>HTTP 一句话文本驱动</strong>），将会话输出作为观众在 TRTC 直播里看到的<strong>唯一主流</strong>；具体会话创建、流就绪、与 TRTC
          进房参数对齐方式见仓库
          <code>docs/trtc-ivh-integration.md</code>。
        </p>
        <p class="hint">
          若仍需旧版 Canvas 实验室推流，请使用独立入口（与正式数字人链路隔离）：
          <RouterLink class="inline-link" :to="`/anchor-canvas/${room.id}`">打开 Canvas 遗留页</RouterLink>
        </p>
      </section>

      <section class="panel">
        <h2 class="panel__title">直播会话（startLive）</h2>
        <p class="hint">
          根因：观众 <code>joinLive</code>、数智人进同一 <code>liveId</code> 前，TUILiveKit 侧需先有「直播」会话。此处用 <strong>主播</strong> 身份调用
          <code>startLive</code>。同一浏览器只能持有一套登录态：已开启直播时，请勿在本页再点「连接评论管理」；需要边看播边审评论请
          <strong>另开浏览器窗口</strong>打开本页仅作 <code>mod_*</code>。
        </p>
        <div class="mod-actions">
          <button
            v-if="!anchorLiveActive"
            type="button"
            class="btn btn--primary"
            :disabled="anchorBusy || modConnected"
            @click="connectAnchorLive"
          >
            {{ anchorBusy ? '开启中…' : '以主播身份开启直播' }}
          </button>
          <button v-else type="button" class="btn" :disabled="anchorBusy" @click="disconnectAnchorLive">
            {{ anchorBusy ? '结束中…' : '结束直播' }}
          </button>
        </div>
        <p v-if="modConnected" class="hint">已连接评论管理时无法在本页开启直播，请先断开评论连接。</p>
        <p v-if="anchorErr" class="err">{{ anchorErr }}</p>
      </section>

      <section class="panel">
        <h2 class="panel__title">评论管理（IM 真实弹幕）</h2>
        <p class="hint">
          与推流/数智人账号隔离：使用 <code>mod_*</code> 身份 <code>joinLive</code> 后拉取弹幕。点击「数字人任务」时，会先调用服务端
          <code>comment-presubmit</code> 暂存本条权威文本，再创建任务（避免浏览器随意篡改 <code>comment_text</code>）。
        </p>
        <div class="mod-actions">
          <button
            v-if="!modConnected"
            type="button"
            class="btn btn--primary"
            :disabled="modBusy || anchorLiveActive"
            @click="connectMod"
          >
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
        <h2 class="panel__title">数字人任务结果</h2>
        <p class="hint">
          服务端异步执行：已配置 <code>IVH_*</code> 时走腾讯云数智人「外部 TRTC AppId + 字符串房间号」创建会话、开启会话、HTTP
          <code>SEND_TEXT</code> 驱动后关闭会话；未配置时仍为占位图。轮询 <code>/api/health</code> 可见
          <code>ivhConfigured</code>。
        </p>
        <template v-if="dhJob">
          <p class="job">
            状态：<strong>{{ dhJob.status }}</strong>
            <span v-if="dhJob.replyText"> · 驱动文本：{{ dhJob.replyText }}</span>
          </p>
          <p v-if="dhJob.status === 'failed'" class="err">{{ dhJob.ivhError || '任务失败' }}</p>
          <template v-if="dhJob.ivhSessionId">
            <p class="muted small">SessionId</p>
            <pre class="mono">{{ dhJob.ivhSessionId }}</pre>
          </template>
          <template v-if="dhJob.ivhVirtualmanUserId">
            <p class="muted small">数智人 TRTC UserId</p>
            <pre class="mono">{{ dhJob.ivhVirtualmanUserId }}</pre>
          </template>
          <template v-if="dhJob.ivhPlayStreamAddr">
            <p class="muted small">PlayStreamAddr（若有）</p>
            <pre class="mono mono--wrap">{{ dhJob.ivhPlayStreamAddr }}</pre>
          </template>
          <img v-if="dhJob.imageUrl" class="dhimg" :src="dhJob.imageUrl" alt="占位图" />
          <p v-if="dhJob.commentSource" class="muted small">评论来源：<code>{{ dhJob.commentSource }}</code></p>
          <p v-if="dhJob.status === 'image_done' && !dhJob.imageUrl && !dhJob.ivhPlayStreamAddr" class="muted">
            TRTC 协议下可能无独立 PlayStreamAddr，请以观众端房间内画面为准。
          </p>
        </template>
        <p v-else class="muted">暂无任务；请在上方列表发起「数字人任务」。</p>
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
const { joinLive, leaveLive, startLive, endLive } = useLiveListState()
const { messageList } = useBarrageState()

const room = ref(null)
const loading = ref(true)
const err = ref('')

const modConnected = ref(false)
const modBusy = ref(false)
const modErr = ref('')
const anchorLiveActive = ref(false)
const anchorBusy = ref(false)
const anchorErr = ref('')
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

async function connectAnchorLive() {
  if (!room.value) return
  if (modConnected.value) {
    anchorErr.value = '请先断开评论管理，再开启直播。'
    return
  }
  anchorErr.value = ''
  dhErr.value = ''
  anchorBusy.value = true
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'anchor' }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    await login({ sdkAppId: j.sdkAppId, userId: j.userId, userSig: j.userSig })
    await startLive({
      liveId: room.value.liveId,
      liveName: room.value.title || '直播',
      notice: '',
    })
    anchorLiveActive.value = true
  } catch (e) {
    anchorErr.value = e?.message || String(e)
    try {
      await logout()
    } catch {
      /* noop */
    }
    anchorLiveActive.value = false
  } finally {
    anchorBusy.value = false
  }
}

async function disconnectAnchorLive() {
  if (!anchorLiveActive.value) return
  anchorBusy.value = true
  anchorErr.value = ''
  try {
    await endLive()
    await logout()
    anchorLiveActive.value = false
  } catch (e) {
    anchorErr.value = e?.message || String(e)
  } finally {
    anchorBusy.value = false
  }
}

async function connectMod() {
  if (!room.value) return
  if (anchorLiveActive.value) {
    modErr.value =
      '本页已以主播身份开启直播，无法在同一标签页再登录 mod。请新开浏览器窗口打开本控制台并仅「连接评论管理」，或先「结束直播」后再连 mod。'
    return
  }
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
    const r0 = await fetch(`/api/rooms/${room.value.id}/digital-human/comment-presubmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: m.sequence,
        timestamp_in_second: m.timestampInSecond,
        sender_user_id: m.sender?.userId || '',
        text: m.textContent,
      }),
    })
    const j0 = await r0.json()
    if (!r0.ok) throw new Error(j0.error || r0.statusText)

    const res = await fetch(`/api/rooms/${room.value.id}/digital-human/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presubmit_ticket: j0.ticket,
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
  if (anchorLiveActive.value) {
    try {
      await endLive()
    } catch {
      /* noop */
    }
    try {
      await logout()
    } catch {
      /* noop */
    }
    anchorLiveActive.value = false
  }
  if (modConnected.value) {
    await disconnectMod()
  }
  dhJob.value = null
  await load()
})

onMounted(() => {
  load()
  pollTimer = setInterval(pollDh, 2000)
})

onUnmounted(async () => {
  if (pollTimer) clearInterval(pollTimer)
  if (anchorLiveActive.value) {
    try {
      await endLive()
    } catch {
      /* noop */
    }
    try {
      await logout()
    } catch {
      /* noop */
    }
    return
  }
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

.panel--roadmap {
  border-color: rgba(126, 184, 255, 0.28);
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

.inline-link {
  color: #9ad4ff;
  font-weight: 600;
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
