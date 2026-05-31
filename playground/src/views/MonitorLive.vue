<template>
  <div class="monitor">
    <header class="monitor__head">
      <h1 class="monitor__title">监控 · 只读</h1>
      <p v-if="room" class="monitor__meta">
        {{ room.title }} · <code>{{ room.liveId }}</code>
      </p>
      <p v-if="err" class="err">{{ err }}</p>
    </header>

    <p v-if="loading" class="muted">加载中…</p>

    <template v-else-if="room">
      <div class="status-bar">
        <span>直播：<strong>{{ session.broadcastStatus || 'idle' }}</strong></span>
        <span>Session：<code>{{ session.ivhSessionId || '—' }}</code></span>
        <span v-if="session.job?.status">任务：<code>{{ session.job.status }}</code></span>
      </div>

      <div class="stage-host">
        <div ref="stageRef" class="stage" />
        <p v-if="!hasRemoteVideo" class="stage-overlay">
          {{ trtcEntered ? '等待数字人画面…' : '正在进入 TRTC 房间…' }}
        </p>
        <p v-else-if="peerLeaveHint" class="stage-overlay stage-overlay--warn">{{ peerLeaveHint }}</p>
      </div>

      <p v-if="remoteUsers.length" class="muted small">
        远端用户：<code>{{ remoteUsers.join(', ') }}</code>
      </p>
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
  hasRemoteVideo,
  remoteUsers,
  enterRoom,
  exitRoom,
} = useTrtcStage()

const room = ref(null)
const loading = ref(true)
const err = ref('')
const session = ref({ broadcastStatus: 'idle', ivhSessionId: null, job: null })
const peerLeaveHint = ref('')
let pollTimer = null
let hadRemote = false

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

async function enterMonitor() {
  if (!room.value) return
  const tokRes = await fetch(`/api/rooms/${room.value.id}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'monitor' }),
  })
  const tok = await tokRes.json()
  if (!tokRes.ok) throw new Error(tok.error || tokRes.statusText)
  await enterRoom({
    sdkAppId: tok.sdkAppId,
    userId: tok.userId,
    userSig: tok.userSig,
    strRoomId: tok.liveId,
    role: 'audience',
  })
}

onMounted(async () => {
  await loadRoom()
  await refreshSession()
  try {
    await enterMonitor()
  } catch (e) {
    err.value = e?.message || String(e)
  }
  pollTimer = setInterval(refreshSession, 4000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  exitRoom()
})

watch(hasRemoteVideo, (v) => {
  if (v) hadRemote = true
  if (hadRemote && !v && remoteUsers.value.length === 0) {
    peerLeaveHint.value = '数字人已离线，请在播控页点击「恢复/重新开始直播」'
  }
})
</script>

<style scoped>
.monitor {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px;
}
.monitor__title {
  margin: 0 0 8px;
}
.monitor__meta {
  color: #555;
}
.status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 14px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 8px;
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
  text-align: center;
  padding: 16px;
}
.stage-overlay--warn {
  background: rgba(0, 0, 0, 0.55);
  color: #ffccc7;
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
</style>
