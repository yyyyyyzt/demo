<template>
  <section class="trtc-panel" aria-label="腾讯直播·SDK 调试">
    <header class="trtc-panel__header">
      <h2 class="trtc-panel__title">腾讯直播 · SDK 调试面板</h2>
      <p class="trtc-panel__hint">
        基于
        <code>tuikit-atomicx-vue3</code>
        AtomicXCore SDK。本面板不渲染视频画面，仅用于研发自闭环验证：
        登录 → 主播开播（可选写随机 metaData）→ 同会话切观众身份取房间信息 →
        独立调用 <code>fetchLiveInfo</code> / <code>queryMetaData</code> 自检。
      </p>
    </header>

    <fieldset class="trtc-fieldset">
      <legend>1. 登录信息</legend>
      <div class="trtc-grid">
        <label class="trtc-field">
          <span>SDKAppID（number）</span>
          <input v-model.number="form.sdkAppId" type="number" placeholder="如 1400000000" />
        </label>
        <label class="trtc-field">
          <span>userId</span>
          <input v-model.trim="form.userId" type="text" placeholder="如 host_001 / viewer_001" />
        </label>
        <label class="trtc-field trtc-field--wide">
          <span>userSig</span>
          <textarea
            v-model.trim="form.userSig"
            rows="2"
            placeholder="服务端或 GenerateTestUserSig 生成的票据"
          />
        </label>
      </div>
      <div class="trtc-actions">
        <button
          type="button"
          class="trtc-btn"
          :disabled="busy || loggedIn"
          @click="onLogin"
        >
          {{ busy && action === 'login' ? '登录中…' : loggedIn ? '已登录' : '仅登录' }}
        </button>
        <span v-if="loggedIn" class="trtc-tag trtc-tag--ok">已登录: {{ form.userId }}</span>
      </div>
    </fieldset>

    <fieldset class="trtc-fieldset">
      <legend>2. liveId（string）</legend>
      <div class="trtc-grid">
        <label class="trtc-field trtc-field--wide">
          <span>liveId（始终是 string，必填）</span>
          <input v-model.trim="form.liveId" type="text" placeholder="主播开播时使用的房间 ID" />
        </label>
      </div>
      <div class="trtc-actions">
        <button type="button" class="trtc-btn trtc-btn--small" @click="useStringId">
          填随机字符串 ID
        </button>
        <button type="button" class="trtc-btn trtc-btn--small" @click="useNumericId">
          填随机数字串 ID
        </button>
        <span class="trtc-tag">
          当前类型: <code>{{ liveIdRuntimeType }}</code>
        </span>
      </div>
      <p class="trtc-hint-line">
        注意：SDK 内 <code>liveId</code> 类型签名是 <code>string</code>。即便看起来是纯数字，
        也必须以字符串形式传入；传 number 会在 C++ 层抛
        <code>'sdkAppId' must be type of number</code> 那种类型校验错。
      </p>
    </fieldset>

    <fieldset class="trtc-fieldset">
      <legend>3. 主播侧 · 开播 / 写 metaData / 结束</legend>
      <div class="trtc-grid">
        <label class="trtc-field">
          <span>liveName</span>
          <input v-model.trim="form.liveName" type="text" placeholder="如 调试房间" />
        </label>
        <label class="trtc-field">
          <span>随机 metaData 条数</span>
          <input v-model.number="form.metaCount" type="number" min="0" max="10" />
        </label>
      </div>
      <div class="trtc-actions">
        <button
          type="button"
          class="trtc-btn trtc-btn--primary"
          :disabled="busy || hosting"
          @click="onStartLive"
        >
          {{ busy && action === 'startLive' ? '开播中…' : '开播（含随机 metaData）' }}
        </button>
        <button
          type="button"
          class="trtc-btn"
          :disabled="busy || !hosting"
          @click="onWriteRandomMeta"
        >
          {{ busy && action === 'writeMeta' ? '写入中…' : '再写一批随机 metaData' }}
        </button>
        <button
          type="button"
          class="trtc-btn trtc-btn--ghost"
          :disabled="busy || !hosting"
          @click="onEndLive"
        >
          {{ busy && action === 'endLive' ? '结束中…' : '结束直播' }}
        </button>
      </div>
      <p v-if="hosting" class="trtc-hint-line">
        当前以主播身份持有房间 <code>{{ form.liveId }}</code>。下面"自检"按钮会复用该会话直接拉房间信息。
      </p>
    </fieldset>

    <fieldset class="trtc-fieldset">
      <legend>4. 观众侧 · 进房 / 离开</legend>
      <div class="trtc-actions">
        <button
          type="button"
          class="trtc-btn"
          :disabled="busy || joined || hosting"
          @click="onJoinAsAudience"
        >
          {{ busy && action === 'join' ? '进房中…' : '观众进房' }}
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
      <p class="trtc-hint-line">
        提示：在同一浏览器会话里，主播自己已经在房间内时，无需再调 <code>joinLive</code>，
        直接用"自检"按钮即可拉信息。这条按钮主要给纯观众身份用。
      </p>
    </fieldset>

    <fieldset class="trtc-fieldset">
      <legend>5. 自检 · fetchLiveInfo / queryMetaData</legend>
      <div class="trtc-actions">
        <button
          type="button"
          class="trtc-btn trtc-btn--primary"
          :disabled="busy || !loggedIn || !form.liveId"
          @click="onFetchLiveInfo"
        >
          {{ busy && action === 'fetchInfo' ? '查询中…' : 'fetchLiveInfo（不进房）' }}
        </button>
        <button
          type="button"
          class="trtc-btn"
          :disabled="busy || !loggedIn || lastMetaKeys.length === 0"
          @click="onQueryMeta"
        >
          {{ busy && action === 'queryMeta' ? '查询中…' : `queryMetaData (${lastMetaKeys.length} keys)` }}
        </button>
        <button
          type="button"
          class="trtc-btn trtc-btn--small"
          :disabled="busy || !loggedIn"
          @click="onFetchList"
        >
          {{ busy && action === 'fetchList' ? '查询中…' : 'fetchLiveList' }}
        </button>
      </div>
    </fieldset>

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

    <div v-if="liveList" class="trtc-panel__result">
      <h3 class="trtc-panel__result-title">直播列表（fetchLiveList）</h3>
      <pre class="trtc-panel__pre">{{ formatJson(liveList) }}</pre>
    </div>

    <details class="trtc-panel__snippet">
      <summary>查看可直接复制的最小观众示例代码</summary>
      <pre class="trtc-panel__pre">{{ snippet }}</pre>
    </details>
  </section>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import {
  endLive,
  fetchLiveInfo,
  fetchLiveList,
  joinLiveAsAudience,
  leaveLive,
  loginToTRTC,
  makeNumericLiveId,
  makeRandomMetaData,
  makeStringLiveId,
  queryRoomMetaData,
  startLiveAsHost,
  subscribeLiveEvents,
  updateRoomMetaData,
} from '../examples/tencentLiveAudience.js'

const form = reactive({
  sdkAppId: null,
  userId: '',
  userSig: '',
  liveId: '',
  liveName: '调试房间',
  metaCount: 3,
})

const liveInfo = ref(null)
const metaData = ref(null)
const liveList = ref(null)
const lastMetaKeys = ref([])
const status = ref('')
const hasError = ref(false)
const busy = ref(false)
const action = ref('')

const loggedIn = ref(false)
const hosting = ref(false)
const joined = ref(false)

let unsubscribe = null

const liveIdRuntimeType = computed(() => typeof form.liveId)

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

async function ensureSubscribed() {
  if (unsubscribe) return
  unsubscribe = await subscribeLiveEvents({
    onLiveEnded: (info) => setStatus(`收到 onLiveEnded: ${formatJson(info)}`, true),
    onKickedOutOfLive: (info) => setStatus(`收到 onKickedOutOfLive: ${formatJson(info)}`, true),
  })
}

async function withBusy(name, fn) {
  if (busy.value) return
  busy.value = true
  action.value = name
  hasError.value = false
  try {
    await fn()
  } catch (err) {
    setStatus(`${name} 失败：${err?.message ?? err}`, true)
    console.error(`[trtc-debug] ${name} error`, err)
  } finally {
    busy.value = false
    action.value = ''
  }
}

function useStringId() {
  form.liveId = makeStringLiveId('debug_')
}

function useNumericId() {
  form.liveId = makeNumericLiveId()
}

async function onLogin() {
  await withBusy('login', async () => {
    setStatus('正在登录 TRTC…')
    await loginToTRTC({
      sdkAppId: form.sdkAppId,
      userId: form.userId,
      userSig: form.userSig,
    })
    await ensureSubscribed()
    loggedIn.value = true
    setStatus('登录成功，可执行后续操作。')
  })
}

async function ensureLogin() {
  if (loggedIn.value) return
  await loginToTRTC({
    sdkAppId: form.sdkAppId,
    userId: form.userId,
    userSig: form.userSig,
  })
  await ensureSubscribed()
  loggedIn.value = true
}

async function onStartLive() {
  await withBusy('startLive', async () => {
    setStatus('正在登录并开播…')
    await ensureLogin()
    await startLiveAsHost({
      liveId: form.liveId,
      liveName: form.liveName || '调试房间',
      isPublicVisible: true,
      isLikeEnabled: true,
    })
    hosting.value = true

    if (form.metaCount > 0) {
      const { keys, metaData: meta } = makeRandomMetaData(form.metaCount)
      await updateRoomMetaData(meta)
      lastMetaKeys.value = keys
      setStatus(`开播成功，已写入 ${form.metaCount} 条 metaData：${keys.join(', ')}`)
    } else {
      lastMetaKeys.value = []
      setStatus('开播成功（未写入 metaData）。')
    }
  })
}

async function onWriteRandomMeta() {
  await withBusy('writeMeta', async () => {
    const count = Math.max(1, form.metaCount || 3)
    const { keys, metaData: meta } = makeRandomMetaData(count)
    await updateRoomMetaData(meta)
    lastMetaKeys.value = keys
    setStatus(`已写入 ${count} 条 metaData：${keys.join(', ')}`)
  })
}

async function onEndLive() {
  await withBusy('endLive', async () => {
    await endLive()
    hosting.value = false
    setStatus('已结束直播。')
  })
}

async function onJoinAsAudience() {
  await withBusy('join', async () => {
    setStatus('正在登录并进房…')
    await ensureLogin()
    await joinLiveAsAudience(form.liveId)
    joined.value = true
    setStatus('进房成功。')
  })
}

async function onLeave() {
  await withBusy('leave', async () => {
    await leaveLive()
    joined.value = false
    setStatus('已离开直播间。')
  })
}

async function onFetchLiveInfo() {
  await withBusy('fetchInfo', async () => {
    setStatus('正在拉取房间基础信息…')
    liveInfo.value = await fetchLiveInfo(form.liveId)
    setStatus(`fetchLiveInfo OK，liveId=${form.liveId}（type=${typeof form.liveId}）`)
  })
}

async function onQueryMeta() {
  await withBusy('queryMeta', async () => {
    setStatus('正在查询房间元数据…')
    metaData.value = await queryRoomMetaData(lastMetaKeys.value)
    setStatus(`queryMetaData OK，命中 keys：${lastMetaKeys.value.join(', ')}`)
  })
}

async function onFetchList() {
  await withBusy('fetchList', async () => {
    setStatus('正在拉取直播列表…')
    liveList.value = await fetchLiveList({ count: 20 })
    setStatus(`fetchLiveList OK，共 ${liveList.value?.length ?? 0} 个房间。`)
  })
}

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
  if (hosting.value) {
    endLive().catch(() => {})
  } else if (joined.value) {
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

// ⚠️ fetchLiveInfo 直接接收字符串，不是 { liveId } 对象
const liveInfo = await fetchLiveInfo('test_live_room_001')
console.log('房间信息:', liveInfo)

const meta = await queryMetaData({ keys: ['currentGoodsId', 'countdown'] })
console.log('房间元数据:', meta)

await leaveLive()`
</script>

<style scoped>
.trtc-panel {
  margin-top: 22px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.32);
  max-width: 560px;
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

.trtc-panel__hint code,
.trtc-hint-line code,
.trtc-tag code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.75rem;
}

.trtc-fieldset {
  margin: 12px 0 0;
  padding: 10px 12px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.trtc-fieldset legend {
  padding: 0 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.trtc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 8px;
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

.trtc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.trtc-btn {
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.8rem;
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

.trtc-btn--small {
  padding: 5px 9px;
  font-size: 0.72rem;
}

.trtc-tag {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.7);
}

.trtc-tag--ok {
  background: rgba(82, 200, 137, 0.18);
  color: #87f0b1;
}

.trtc-hint-line {
  margin: 8px 0 0;
  font-size: 0.74rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);
}

.trtc-panel__status {
  margin: 10px 0 6px;
  font-size: 0.8rem;
  color: #9ad4ff;
  word-break: break-all;
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
  white-space: pre-wrap;
  word-break: break-all;
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

@media (max-width: 520px) {
  .trtc-grid {
    grid-template-columns: 1fr;
  }
}
</style>
