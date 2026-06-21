<template>
  <div class="admin">
    <header class="admin__head">
      <h1 class="admin__title">数字人直播 · 管理台</h1>
      <p class="admin__sub">
        生产标准演示流程：1) 创建直播间；2) 进入「评论播控台」点「开始直播」，复制
        <strong>OBS 拉流/推流地址</strong>，由专业 OBS 拉数字人画面 → 抠像/虚拟背景/装修 → 推回直播间；
        3) 把<strong>观众链接</strong>发给真实观众（手机即可观看）；4) 评论真走腾讯
        <code>IM</code>，播控台可生成模型回复、二次编辑后播报，并支持撤回、禁言；多名管理员用各自链接协作。
      </p>
    </header>

    <section class="card">
      <h2 class="card__title">新建</h2>
      <form class="row" @submit.prevent="createRoom">
        <input v-model.trim="newTitle" type="text" placeholder="房间标题" class="inp grow" />
        <button type="submit" class="btn btn--primary" :disabled="creating">创建</button>
      </form>
      <p v-if="topError" class="err">{{ topError }}</p>
    </section>

    <section class="card">
      <h2 class="card__title">列表</h2>
      <p v-if="loading">加载中…</p>
      <ul v-else class="rooms">
        <li v-for="r in rooms" :key="r.id" class="room">
          <div class="room__title">{{ r.title }}</div>
          <div class="room__meta">
            <code>{{ r.liveId }}</code>
          </div>
          <div class="room__actions">
            <RouterLink class="btn btn--sm btn--primary" :to="`/studio/${r.id}`">进入播控台</RouterLink>
            <a
              class="btn btn--sm btn--secondary"
              :href="`/monitor/${r.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >监控窗口</a>
            <button
              type="button"
              class="btn btn--sm btn--danger"
              :disabled="dissolvingId === r.id"
              @click="dissolveRoom(r)"
            >
              {{ dissolvingId === r.id ? '解散中…' : '解散直播间' }}
            </button>
          </div>
          <div class="room__links">
            <div class="link-row">
              <span class="link-row__label">观众链接</span>
              <code class="link-row__url">{{ origin }}/live/{{ r.liveId }}</code>
              <button type="button" class="btn btn--xs" @click="copyLink(`${origin}/live/${r.liveId}`)">复制</button>
              <a class="btn btn--xs" :href="`/live/${r.liveId}`" target="_blank" rel="noopener noreferrer">打开</a>
            </div>
            <div class="link-row">
              <span class="link-row__label">管理员 A</span>
              <code class="link-row__url">{{ origin }}/studio/{{ r.id }}?mod=a</code>
              <button type="button" class="btn btn--xs" @click="copyLink(`${origin}/studio/${r.id}?mod=a`)">复制</button>
            </div>
            <div class="link-row">
              <span class="link-row__label">管理员 B</span>
              <code class="link-row__url">{{ origin }}/studio/{{ r.id }}?mod=b</code>
              <button type="button" class="btn btn--xs" @click="copyLink(`${origin}/studio/${r.id}?mod=b`)">复制</button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const rooms = ref([])
const loading = ref(true)
const creating = ref(false)
const dissolvingId = ref('')
const newTitle = ref('')
const topError = ref('')
const origin = typeof window !== 'undefined' ? window.location.origin : ''

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url)
    topError.value = ''
  } catch {
    /* 剪贴板不可用时忽略，用户可手动复制 */
  }
}

async function loadRooms() {
  loading.value = true
  topError.value = ''
  try {
    const res = await fetch('/api/rooms')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.statusText)
    rooms.value = data.rooms || []
  } catch (e) {
    topError.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function createRoom() {
  creating.value = true
  topError.value = ''
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.value || '未命名直播间' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.statusText)
    newTitle.value = ''
    await loadRooms()
  } catch (e) {
    topError.value = e?.message || String(e)
  } finally {
    creating.value = false
  }
}

async function dissolveRoom(room) {
  const liveHint = room.liveId ? `\nliveId：${room.liveId}` : ''
  const ok = window.confirm(
    `确定解散直播间「${room.title}」？${liveHint}\n\n将结束数智人会话、清除评论与任务记录，且不可恢复。`,
  )
  if (!ok) return

  dissolvingId.value = room.id
  topError.value = ''
  try {
    const res = await fetch(`/api/rooms/${room.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.statusText)
    await loadRooms()
  } catch (e) {
    topError.value = e?.message || String(e)
  } finally {
    dissolvingId.value = ''
  }
}

onMounted(loadRooms)
</script>

<style scoped>
.admin {
  max-width: 40rem;
  margin: 0 auto;
  padding: max(20px, env(safe-area-inset-top)) 16px max(32px, env(safe-area-inset-bottom));
}

.admin__head {
  margin-bottom: 18px;
}

.admin__title {
  margin: 0 0 6px;
  font-size: 1.35rem;
}

.admin__sub {
  margin: 0 0 12px;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.admin__nav {
  display: flex;
  gap: 14px;
  font-size: 0.88rem;
}

.admin__nav a {
  color: #9ad4ff;
}

.card {
  padding: 16px;
  margin-bottom: 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.28);
}

.card__title {
  margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 600;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.inp {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 0.95rem;
}

.grow {
  flex: 1;
  min-width: 0;
}

.btn {
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  padding: 10px 14px;
  font-size: 0.88rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  text-align: center;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
}

.btn--sm {
  padding: 6px 10px;
  font-size: 0.78rem;
}

.btn--xs {
  padding: 3px 8px;
  font-size: 0.72rem;
}

.room__links {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.link-row__label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.6);
  min-width: 4.5em;
}

.link-row__url {
  flex: 1;
  min-width: 0;
  font-size: 0.72rem;
  color: #b8e0ff;
  background: rgba(0, 0, 0, 0.35);
  padding: 4px 8px;
  border-radius: 6px;
  word-break: break-all;
}

.btn--ghost {
  border-style: dashed;
  opacity: 0.9;
}

.btn--secondary {
  border-color: rgba(154, 212, 255, 0.45);
  background: rgba(79, 141, 255, 0.15);
  color: #d6ebff;
}

.btn--danger {
  border-color: rgba(255, 120, 117, 0.55);
  background: rgba(255, 77, 79, 0.22);
  color: #ffccc7;
}

button.btn {
  font-family: inherit;
}

.err {
  margin: 10px 0 0;
  color: #ff9b9b;
  font-size: 0.85rem;
}

.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
}

.room {
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.room:last-child {
  border-bottom: none;
}

.room__title {
  font-weight: 600;
  margin-bottom: 4px;
}

.room__meta code {
  font-size: 0.78rem;
  color: #b8e0ff;
  word-break: break-all;
}

.room__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
</style>
