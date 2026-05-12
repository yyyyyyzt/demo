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

      <section v-if="apiHealth" class="panel panel--ivh-env">
        <h2 class="panel__title">数智人配置（服务端）</h2>
        <template v-if="apiHealth.ivhConfigured">
          <p class="hint hint--ok">
            已检测到 <code>IVH_APP_KEY</code>、<code>IVH_ACCESS_TOKEN</code>、<code>IVH_VIRTUALMAN_PROJECT_ID</code>，数字人任务将调用腾讯云网关（仍依赖
            TRTC 与数智人项目侧配置正确）。
          </p>
        </template>
        <template v-else>
          <p class="hint">
            下方状态为<strong>预期行为</strong>，不是接口报错：未填全数智人密钥时，任务会走<strong>本地占位图</strong>，便于先跑通评论 → 任务链路。
          </p>
          <p class="hint">
            {{ apiHealth.ivhEnvFileHint }}，并补全缺少项（当前缺失：<strong>{{ (apiHealth.ivhMissingEnvKeys || []).join(', ') || '无' }}</strong>）。
          </p>
          <ul class="link-list">
            <li>
              <a :href="apiHealth.ivhConsoleKeys" class="inline-link" target="_blank" rel="noopener noreferrer"
                >控制台获取 AppKey / AccessToken</a
              >
            </li>
            <li>
              <a :href="apiHealth.ivhDocsSigning" class="inline-link" target="_blank" rel="noopener noreferrer"
                >aPaaS 签名与公共参数说明</a
              >
            </li>
          </ul>
        </template>
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
          与推流/数智人账号隔离：使用 <code>mod_*</code> 身份 <code>joinLive</code> 后拉取弹幕。标记为 <strong>待审</strong> 的文本为观众发送的
          <code>audit=pending</code> 消息；点「批准显示」由服务端调 IM REST 以原用户身份代发 <code>audit=public</code> 公区消息。「数字人任务」仍走
          <code>comment-presubmit</code>。
        </p>
        <p v-if="modConnected && apiHealth && !apiHealth.imApprovePublishConfigured" class="hint hint--warn">
          未配置 <code>IM_REST_ADMIN_USER_ID</code> 时无法「批准显示」（需 IM App 管理员 userId）。请见根目录 <code>.env.example</code>。
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
          <p class="muted small">共 {{ messageList.length }} 条（含待审与历史）</p>
          <ul class="msg-list">
            <li v-for="m in messageList" :key="msgKey(m)" class="msg-row" :class="{ 'msg-row--pending': isPendingBarrage(m) }">
              <div class="msg-main">
                <span class="msg-user">{{ m.sender?.userName || m.sender?.userId }}</span>
                <span v-if="isPendingBarrage(m)" class="msg-badge">待审</span>
                <span v-else-if="isPublicBarrage(m)" class="msg-badge msg-badge--ok">已过审</span>
                <span class="msg-text">{{ m.textContent || '（非文本）' }}</span>
              </div>
              <div class="msg-actions">
                <template v-if="isTextBarrage(m) && isPendingBarrage(m) && !approveSentKeys.includes(msgKey(m))">
                  <button
                    type="button"
                    class="btn btn--sm btn--approve"
                    :disabled="approveBusyKey === msgKey(m) || !apiHealth?.imApprovePublishConfigured"
                    @click="approveBarrage(m)"
                  >
                    {{ approveBusyKey === msgKey(m) ? '提交中…' : '批准显示' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn--sm"
                    :disabled="dhBusyId === msgKey(m)"
                    @click="startDhJob(m)"
                  >
                    数字人任务
                  </button>
                </template>
                <template v-else-if="isTextBarrage(m) && !isPendingBarrage(m)">
                  <button type="button" class="btn btn--sm" :disabled="dhBusyId === msgKey(m)" @click="startDhJob(m)">
                    数字人任务
                  </button>
                </template>
              </div>
            </li>
          </ul>
          <p v-if="!messageList.length" class="muted">暂无弹幕，请在观众端进房后发送。</p>
        </template>
      </section>

      <section class="panel">
        <h2 class="panel__title">数字人任务结果</h2>
        <p class="hint">
          已配置数智人时：服务端异步调用 <code>gw.tvs.qq.com</code>（创建会话 → 就绪 → 开启 → <code>SEND_TEXT</code> → 关闭）。未配置时仍为<strong>占位图演示</strong>，见上方「数智人配置」面板。
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
          <p
            v-if="dhJob.status === 'image_done' && dhJob.imageUrl && apiHealth && !apiHealth.ivhConfigured"
            class="hint hint--soft"
          >
            本条为<strong>未配置 IVH</strong>时的占位结果（随机图 + 上文说明），配置完整并重启 API 后将走真实数智人链路。
          </p>
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
import { isPendingBarrage, isPublicBarrage, barrageDedupeKey } from '../utils/barrageAudit.js'

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
const approveBusyKey = ref('')
const approveSentKeys = ref([])
const apiHealth = ref(null)
let pollTimer = null
let healthTimer = null

async function refreshApiHealth() {
  try {
    const r = await fetch('/api/health')
    const j = await r.json()
    if (r.ok) apiHealth.value = j
  } catch {
    /* noop */
  }
}

function msgKey(m) {
  return barrageDedupeKey(m)
}

function isTextBarrage(m) {
  return m?.messageType === 0
}

async function approveBarrage(m) {
  if (!room.value || !isTextBarrage(m) || !isPendingBarrage(m)) return
  const k = msgKey(m)
  approveBusyKey.value = k
  modErr.value = ''
  try {
    const r = await fetch(`/api/rooms/${room.value.id}/barrage/approve-publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: m.sequence,
        timestamp_in_second: m.timestampInSecond,
        sender_user_id: m.sender?.userId || '',
        text: m.textContent || '',
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.statusText)
    approveSentKeys.value = [...approveSentKeys.value, k]
  } catch (e) {
    modErr.value = e?.message || String(e)
  } finally {
    approveBusyKey.value = ''
  }
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
    refreshApiHealth()
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
  approveSentKeys.value = []
  dhJob.value = null
  await load()
  await refreshApiHealth()
})

onMounted(() => {
  load()
  refreshApiHealth()
  pollTimer = setInterval(pollDh, 2000)
  healthTimer = setInterval(refreshApiHealth, 12000)
})

onUnmounted(async () => {
  if (pollTimer) clearInterval(pollTimer)
  if (healthTimer) clearInterval(healthTimer)
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

.panel--ivh-env {
  border-color: rgba(255, 200, 120, 0.25);
  background: rgba(40, 28, 0, 0.22);
}

.hint--ok {
  color: rgba(160, 255, 190, 0.92);
}

.hint--soft {
  color: rgba(255, 220, 160, 0.88);
}

.link-list {
  margin: 0 0 0 1.1rem;
  padding: 0;
  font-size: 0.82rem;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.72);
}

.link-list a {
  word-break: break-all;
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

.msg-row--pending {
  background: rgba(80, 60, 0, 0.18);
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 8px;
}

.msg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  flex: 0 0 auto;
}

.msg-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  vertical-align: middle;
  background: rgba(255, 180, 80, 0.25);
  color: #ffd28a;
}

.msg-badge--ok {
  background: rgba(80, 200, 120, 0.2);
  color: #9cf0b8;
}

.btn--approve {
  border-color: rgba(120, 220, 160, 0.45);
  background: rgba(40, 90, 60, 0.35);
}

.hint--warn {
  color: rgba(255, 200, 140, 0.9);
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
