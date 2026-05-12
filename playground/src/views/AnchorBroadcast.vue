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
          下方为仓库同源 <code>demo/minimal-live-broadcast.html</code>（Canvas 推流）。已预填 SDKAppID / userId / UserSig / 房间号；点页面内「开播」即可。
        </p>
        <iframe class="frame" title="Canvas 开播" :src="iframeSrc" />
      </section>

      <section class="panel">
        <h2 class="panel__title">数字人输出（占位轮询）</h2>
        <p class="hint">管理台「选中并生成」后，约 1s 内状态变为 image_done；此处每 2s 拉取 active-job 展示占位图（未合入 Canvas 推流，仅验证链路）。</p>
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

const route = useRoute()
const roomId = computed(() => route.params.roomId)

const room = ref(null)
const token = ref(null)
const loading = ref(true)
const err = ref('')

const iframeSrc = ref('')

const dhJob = ref(null)
let pollTimer = null

async function load() {
  loading.value = true
  err.value = ''
  room.value = null
  token.value = null
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
    token.value = j2

    const params = new URLSearchParams({
      sdkAppId: String(j2.sdkAppId),
      userId: j2.userId,
      userSig: j2.userSig,
      strRoomId: j1.liveId,
      liveTitle: j1.title || 'Demo 直播',
      orientation: 'portrait',
    })
    iframeSrc.value = `/minimal-live-broadcast.html?${params.toString()}`
  } catch (e) {
    err.value = e?.message || String(e)
  } finally {
    loading.value = false
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

watch(roomId, () => {
  load()
  dhJob.value = null
})

onMounted(() => {
  load()
  pollTimer = setInterval(pollDh, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
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

.frame {
  width: 100%;
  min-height: 72vh;
  border: none;
  border-radius: 10px;
  background: #0f1419;
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
