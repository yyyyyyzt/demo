<template>
  <div class="admin">
    <header class="admin__head">
      <h1 class="admin__title">直播间管理</h1>
      <p class="admin__sub">REST 演示：创建房间后，用「主播开播」与观众端同一 liveId 联调。</p>
      <nav class="admin__nav">
        <RouterLink to="/">观众端</RouterLink>
        <RouterLink to="/legacy">历史调试</RouterLink>
      </nav>
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
          <div class="room__main">
            <div class="room__title">{{ r.title }}</div>
            <div class="room__meta">
              <code>{{ r.liveId }}</code>
            </div>
            <div class="room__actions">
              <RouterLink class="btn btn--sm" :to="{ path: '/', query: { liveId: r.liveId } }">观众 H5</RouterLink>
              <RouterLink class="btn btn--sm" :to="`/anchor/${r.id}`">主播开播</RouterLink>
              <button type="button" class="btn btn--sm" @click="toggleDh(r.id)">
                {{ dhPanelRoomId === r.id ? '收起评论' : '评论 / 数字人' }}
              </button>
            </div>
          </div>

          <div v-if="dhPanelRoomId === r.id" class="dh">
            <p class="dh__hint">以下为 Mock 评论；选中一条将创建占位数字人任务（无真实大模型）。主播页会轮询展示生成图。</p>
            <p v-if="dhError" class="err">{{ dhError }}</p>
            <ul v-if="dhComments.length" class="dh__list">
              <li v-for="c in dhComments" :key="c.id" class="dh__item">
                <div class="dh__text">{{ c.text }}</div>
                <div class="dh__sub">{{ c.user }} · {{ c.createdAt }}</div>
                <button type="button" class="btn btn--sm btn--accent" :disabled="dhBusy" @click="runDh(r.id, c)">
                  选中并生成
                </button>
              </li>
            </ul>
            <p v-else class="muted">暂无评论数据</p>
            <p v-if="lastJob" class="dh__job">
              最近任务：<strong>{{ lastJob.status }}</strong>
              <span v-if="lastJob.replyText"> — {{ lastJob.replyText }}</span>
            </p>
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
const newTitle = ref('')
const topError = ref('')

const dhPanelRoomId = ref(null)
const dhComments = ref([])
const dhError = ref('')
const dhBusy = ref(false)
const lastJob = ref(null)

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

async function toggleDh(roomId) {
  dhError.value = ''
  lastJob.value = null
  if (dhPanelRoomId.value === roomId) {
    dhPanelRoomId.value = null
    dhComments.value = []
    return
  }
  dhPanelRoomId.value = roomId
  try {
    const res = await fetch(`/api/rooms/${roomId}/comments`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.statusText)
    dhComments.value = data.items || []
  } catch (e) {
    dhError.value = e?.message || String(e)
    dhComments.value = []
  }
}

async function runDh(roomId, comment) {
  dhBusy.value = true
  dhError.value = ''
  try {
    const res = await fetch(`/api/rooms/${roomId}/digital-human/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: comment.id, comment_text: comment.text }),
    })
    const job = await res.json()
    if (!res.ok) throw new Error(job.error || res.statusText)
    lastJob.value = job
  } catch (e) {
    dhError.value = e?.message || String(e)
  } finally {
    dhBusy.value = false
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

.btn--accent {
  margin-top: 8px;
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(56, 189, 248, 0.15);
}

.err {
  margin: 10px 0 0;
  color: #ff9b9b;
  font-size: 0.85rem;
}

.muted {
  color: rgba(255, 255, 255, 0.5);
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

.dh {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.dh__hint {
  margin: 0 0 10px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.45;
}

.dh__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.dh__item {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dh__item:last-child {
  border-bottom: none;
}

.dh__text {
  font-size: 0.9rem;
}

.dh__sub {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 4px 0 0;
}

.dh__job {
  margin: 12px 0 0;
  font-size: 0.82rem;
  color: rgba(200, 230, 255, 0.95);
}
</style>
