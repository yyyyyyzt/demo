<template>
  <section class="trtc-panel" aria-label="腾讯直播·观众进房示例">
    <header class="trtc-panel__header">
      <h2 class="trtc-panel__title">腾讯直播 · 观众进房示例</h2>
      <p class="trtc-panel__hint">
        填入 SDKAppID / userId / userSig / liveId 后点“进房并取信息”，可调用真实的
        <code>tuikit-atomicx-vue3</code>
        SDK 完成观众身份登录、进房、拉房间信息和元数据。本面板仅做调试演示，不渲染视频画面。
      </p>
    </header>

    <div class="trtc-panel__form">
      <label class="trtc-field">
        <span>SDKAppID</span>
        <input v-model.number="form.sdkAppId" type="number" placeholder="如 1400000000" />
      </label>
      <label class="trtc-field">
        <span>userId</span>
        <input v-model.trim="form.userId" type="text" placeholder="如 viewer_001" />
      </label>
      <label class="trtc-field trtc-field--wide">
        <span>userSig</span>
        <textarea
          v-model.trim="form.userSig"
          rows="2"
          placeholder="服务端或 GenerateTestUserSig 生成的票据"
        />
      </label>
      <label class="trtc-field">
        <span>liveId</span>
        <input v-model.trim="form.liveId" type="text" placeholder="主播开播时的房间 ID" />
      </label>
      <label class="trtc-field">
        <span>metaData keys（可选, 逗号分隔）</span>
        <input v-model.trim="form.metaKeys" type="text" placeholder="如 currentGoodsId,countdown" />
      </label>
    </div>

    <div class="trtc-panel__actions">
      <button
        type="button"
        class="trtc-btn trtc-btn--primary"
        :disabled="busy"
        @click="onEnter"
      >
        {{ busy && action === 'enter' ? '进房中…' : '进房并取信息' }}
      </button>
      <button
        type="button"
        class="trtc-btn"
        :disabled="busy || !joined"
        @click="onRefresh"
      >
        {{ busy && action === 'refresh' ? '刷新中…' : '刷新房间信息' }}
      </button>
      <button
        type="button"
        class="trtc-btn trtc-btn--ghost"
        :disabled="busy || !joined"
        @click="onLeave"
      >
        {{ busy && action === 'leave' ? '离开中…' : '离开直播间' }}
      </button>
    </div>

    <p v-if="status" class="trtc-panel__status" :class="{ 'is-error': hasError }">
      {{ status }}
    </p>

    <div v-if="liveInfo" class="trtc-panel__result">
      <h3 class="trtc-panel__result-title">房间基础信息（fetchLiveInfo）</h3>
      <pre class="trtc-panel__pre">{{ formatJson(liveInfo) }}</pre>
    </div>

    <div v-if="metaData" class="trtc-panel__result">
      <h3 class="trtc-panel__result-title">房间元数据（queryMetaData）</h3>
      <pre class="trtc-panel__pre">{{ formatJson(metaData) }}</pre>
    </div>

    <details class="trtc-panel__snippet">
      <summary>查看可直接复制的最小示例代码</summary>
      <pre class="trtc-panel__pre">{{ snippet }}</pre>
    </details>
  </section>
</template>

<script setup>
import { onUnmounted, reactive, ref } from 'vue'
import {
  enterLiveAndFetchInfo,
  fetchLiveInfo,
  leaveLive,
  queryRoomMetaData,
  subscribeLiveEvents,
} from '../examples/tencentLiveAudience.js'

const form = reactive({
  sdkAppId: null,
  userId: '',
  userSig: '',
  liveId: '',
  metaKeys: '',
})

const liveInfo = ref(null)
const metaData = ref(null)
const status = ref('')
const hasError = ref(false)
const busy = ref(false)
const joined = ref(false)
const action = ref('')

let unsubscribe = null

function parseMetaKeys() {
  if (!form.metaKeys) return []
  return form.metaKeys
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

function setStatus(text, error = false) {
  status.value = text
  hasError.value = error
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function onEnter() {
  if (busy.value) return
  busy.value = true
  action.value = 'enter'
  hasError.value = false
  status.value = '正在登录并进入直播间…'
  try {
    const metaKeys = parseMetaKeys()
    const result = await enterLiveAndFetchInfo({
      sdkAppId: form.sdkAppId,
      userId: form.userId,
      userSig: form.userSig,
      liveId: form.liveId,
      metaKeys,
    })
    liveInfo.value = result.liveInfo
    metaData.value = result.metaData
    joined.value = true
    setStatus('进房成功，已取到房间信息。')

    unsubscribe?.()
    unsubscribe = await subscribeLiveEvents({
      onLiveEnded: () => setStatus('主播已结束直播。', true),
      onKickedOutOfLive: () => setStatus('已被踢出直播间。', true),
    })
  } catch (err) {
    setStatus(`进房失败：${err?.message ?? err}`, true)
  } finally {
    busy.value = false
    action.value = ''
  }
}

async function onRefresh() {
  if (busy.value || !joined.value) return
  busy.value = true
  action.value = 'refresh'
  hasError.value = false
  status.value = '正在重新拉取房间信息…'
  try {
    liveInfo.value = await fetchLiveInfo(form.liveId)
    const metaKeys = parseMetaKeys()
    metaData.value = metaKeys.length ? await queryRoomMetaData(metaKeys) : null
    setStatus('房间信息已刷新。')
  } catch (err) {
    setStatus(`刷新失败：${err?.message ?? err}`, true)
  } finally {
    busy.value = false
    action.value = ''
  }
}

async function onLeave() {
  if (busy.value || !joined.value) return
  busy.value = true
  action.value = 'leave'
  hasError.value = false
  status.value = '正在离开直播间…'
  try {
    unsubscribe?.()
    unsubscribe = null
    await leaveLive()
    joined.value = false
    setStatus('已离开直播间。')
  } catch (err) {
    setStatus(`离开失败：${err?.message ?? err}`, true)
  } finally {
    busy.value = false
    action.value = ''
  }
}

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
  if (joined.value) {
    leaveLive().catch(() => {})
  }
})

const snippet = `import {
  useLoginState,
  useLiveListState,
} from 'tuikit-atomicx-vue3'

const { login } = useLoginState()
const { joinLive, fetchLiveInfo, queryMetaData, leaveLive } = useLiveListState()

await login({
  sdkAppId: 1400000000,
  userId: 'viewer_001',
  userSig: '<服务端生成的 userSig>',
})

await joinLive({ liveId: 'test_live_room_001' })

const liveInfo = await fetchLiveInfo({ liveId: 'test_live_room_001' })
console.log('房间信息:', liveInfo)

const meta = await queryMetaData({ keys: ['currentGoodsId', 'countdown'] })
console.log('房间元数据:', meta)

// 业务结束后
await leaveLive()`
</script>

<style scoped>
.trtc-panel {
  margin-top: 22px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.32);
  max-width: 520px;
  color: rgba(255, 255, 255, 0.85);
}

.trtc-panel__header {
  margin-bottom: 12px;
}

.trtc-panel__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}

.trtc-panel__hint {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
}

.trtc-panel__hint code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.75rem;
}

.trtc-panel__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin-bottom: 12px;
}

.trtc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.6);
}

.trtc-field--wide {
  grid-column: 1 / -1;
}

.trtc-field input,
.trtc-field textarea {
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  font: inherit;
  font-size: 0.82rem;
  resize: vertical;
}

.trtc-field input:focus,
.trtc-field textarea:focus {
  outline: none;
  border-color: rgba(126, 184, 255, 0.7);
}

.trtc-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.trtc-btn {
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}

.trtc-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}

.trtc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.trtc-btn--primary {
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
  border-color: transparent;
}

.trtc-btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.trtc-btn--ghost {
  background: transparent;
}

.trtc-panel__status {
  margin: 6px 0 10px;
  font-size: 0.8rem;
  color: #9ad4ff;
}

.trtc-panel__status.is-error {
  color: #ff8e8e;
}

.trtc-panel__result {
  margin-top: 10px;
}

.trtc-panel__result-title {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
}

.trtc-panel__pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 240px;
  overflow: auto;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(200, 230, 255, 0.95);
  font-size: 0.72rem;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.trtc-panel__snippet {
  margin-top: 12px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.55);
}

.trtc-panel__snippet summary {
  cursor: pointer;
  user-select: none;
  margin-bottom: 6px;
}

@media (max-width: 480px) {
  .trtc-panel__form {
    grid-template-columns: 1fr;
  }
}
</style>
