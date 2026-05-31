<template>
  <div class="monitor-ph">
    <RouterLink to="/admin">← 管理台</RouterLink>
    <h1>监控页</h1>
    <p v-if="roomId">房间 ID：<code>{{ roomId }}</code></p>
    <p class="muted">完整只读监控页将在 Phase D 接入（TRTC 预览 + 会话状态轮询）。</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const roomId = computed(() => route.params.roomId)
</script>

<style scoped>
.monitor-ph {
  padding: 24px;
  max-width: 720px;
  margin: 0 auto;
}
.muted {
  color: #666;
}
</style>
