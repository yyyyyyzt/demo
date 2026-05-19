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

const audienceUrl = computed(() => {
  if (!room.value) return ''
  if (typeof window === 'undefined') return ''
  const url = new URL('/', window.location.origin)
  url.searchParams.set('liveId', room.value.liveId)
  return url.toString()
})

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
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    dhStopping.value = false
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

watch(roomId, async () => {
  if (trtcEntered.value) await exitRoom()
  dhJob.value = null
  await loadRoom()
})

onMounted(() => {
  loadRoom()
  refreshApiHealth()
  pollTimer = setInterval(pollDh, 2000)
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
