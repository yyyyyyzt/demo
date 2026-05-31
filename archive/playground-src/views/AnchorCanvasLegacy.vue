<template>
  <div class="legacy">
    <header class="legacy__head">
      <RouterLink class="back" :to="`/anchor/${roomId}`">← 返回主播控制台</RouterLink>
      <h1 class="legacy__title">Canvas 推流（遗留调试用）</h1>
      <p v-if="room" class="legacy__meta">
        {{ room.title }} · <code>{{ room.liveId }}</code>
      </p>
      <p v-if="err" class="err">{{ err }}</p>
    </header>

    <p v-if="loading" class="muted">加载房间与主播票据…</p>

    <template v-else-if="room && iframeSrc">
      <section class="panel">
        <p class="hint">
          此页为历史方案：<strong>TUIRoomEngine + Canvas 自定义视频轨</strong>。正式链路将改为 TRTC + 腾讯云数智人云渲染（见
          <code>docs/trtc-ivh-integration.md</code>）。
        </p>
        <div class="push-actions">
          <button type="button" class="btn btn--primary" @click="postStart">开始推流</button>
          <button type="button" class="btn" @click="postStop">结束推流</button>
        </div>
        <div class="iframe-host" aria-hidden="true">
          <iframe ref="iframeRef" class="frame" title="Canvas 推流（隐藏）" :src="iframeSrc" />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const roomId = computed(() => route.params.roomId)

const room = ref(null)
const loading = ref(true)
const err = ref('')
const iframeRef = ref(null)
const iframeSrc = ref('')

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

watch(roomId, () => {
  load()
})

onMounted(() => {
  load()
})
</script>

<style scoped>
.legacy {
  max-width: 52rem;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 12px max(24px, env(safe-area-inset-bottom));
}

.back {
  display: inline-block;
  margin-bottom: 8px;
  font-size: 0.88rem;
  color: #9ad4ff;
  text-decoration: none;
}

.legacy__title {
  margin: 0 0 6px;
  font-size: 1.2rem;
}

.legacy__meta {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.72);
}

.legacy__meta code {
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
</style>
