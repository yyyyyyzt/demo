<template>
  <div class="admin">
    <header class="admin__head">
      <h1 class="admin__title">数字人直播 · 管理台</h1>
      <p class="admin__sub">
        最精简流程：1) 在此创建一个房间； 2) 进入「主播控制台」点「主播开播」→「发起数字人测试」；
        3) 新开窗口打开「观众 H5」用同一 <code>liveId</code> 看播；观众「提交审核」的评论在主播页<strong>待审列表</strong>处理后再公区显示或送入数字人。主播页与观众页都用原生
        <code>trtc-sdk-v5</code> 订阅房间内远端视频，能直接看到数字人画面（不依赖 TUILiveKit 的 anchor 流概念）。
      </p>
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
          <div class="room__title">{{ r.title }}</div>
          <div class="room__meta">
            <code>{{ r.liveId }}</code>
          </div>
          <div class="room__actions">
            <RouterLink class="btn btn--sm btn--primary" :to="`/anchor/${r.id}`">主播控制台</RouterLink>
            <RouterLink class="btn btn--sm" :to="{ path: '/', query: { liveId: r.liveId } }">观众 H5</RouterLink>
            <RouterLink class="btn btn--sm btn--ghost" :to="`/anchor-canvas/${r.id}`">Canvas 遗留</RouterLink>
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

.btn--ghost {
  border-style: dashed;
  opacity: 0.9;
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
