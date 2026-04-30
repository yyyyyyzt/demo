<template>
  <div class="debug-page">
    <header class="debug-header">
      <h1>点赞动画调试</h1>
      <p class="hint">右下角连点：动画立刻播放；数字经防抖 + 模拟延迟后才增加（贴近真实接口）。</p>
      <p class="log">
        展示点赞数：<strong>{{ count }}</strong>
        <span v-if="queued > 0" class="badge">待合并：{{ queued }}</span>
        <span v-if="sending" class="badge is-sending">请求中…</span>
      </p>
    </header>

    <section class="debug-panel" aria-label="调试参数">
      <label class="slider">
        <span>防抖等待（停点后多久发请求）</span>
        <input v-model.number="waitMs" type="range" min="400" max="5000" step="100" />
        <output>{{ waitMs }} ms</output>
      </label>
      <label class="slider">
        <span>模拟接口延迟</span>
        <input v-model.number="latencyMs" type="range" min="0" max="3000" step="50" />
        <output>{{ latencyMs }} ms</output>
      </label>
      <label class="slider">
        <span>动画时长（最短）</span>
        <input v-model.number="durationMin" type="range" min="800" max="5000" step="50" />
        <output>{{ durationMin }} ms</output>
      </label>
      <label class="slider">
        <span>动画时长（最长）</span>
        <input v-model.number="durationMax" type="range" min="1000" max="6000" step="50" />
        <output>{{ durationMax }} ms</output>
      </label>
      <label class="slider">
        <span>上升高度（小 → 大）</span>
        <input v-model.number="riseRange" type="range" min="120" max="320" step="4" />
        <output>{{ riseMin }}–{{ riseMax }} px</output>
      </label>
      <label class="slider">
        <span>左右晃动强度</span>
        <input v-model.number="swayMax" type="range" min="6" max="72" step="2" />
        <output>±{{ swayMin }}–{{ swayMax }} px</output>
      </label>
      <label class="slider">
        <span>终点水平漂移</span>
        <input v-model.number="driftMax" type="range" min="24" max="160" step="2" />
        <output>{{ driftMin }}–{{ driftMax }} px</output>
      </label>
      <label class="slider">
        <span>按钮大小</span>
        <input v-model.number="size" type="range" min="44" max="88" step="2" />
        <output>{{ size }} px</output>
      </label>
      <label class="field row">
        <span>每次飘几个</span>
        <input v-model.number="burstSize" type="number" min="1" max="24" />
      </label>
      <label class="field row">
        <span>同时最多几颗</span>
        <input v-model.number="maxParticles" type="number" min="4" max="200" />
      </label>
      <label class="field checkbox">
        <input v-model="showCount" type="checkbox" />
        <span>显示点赞数</span>
      </label>
    </section>

    <section class="snippet" aria-label="迁移用 CSS 变量">
      <h2 class="snippet-title">迁移到其它页面时可复制的变量（与组件 root 一致）</h2>
      <pre class="snippet-pre">{{ cssSnippet }}</pre>
    </section>

    <div class="like-dock">
      <LiveLikeButton
        await-server-count
        :count="count"
        :burst-size="burstSize"
        :max-particles="maxParticles"
        :size="size"
        :show-count="showCount"
        :float-duration-min="durationMin"
        :float-duration-max="durationMax"
        :float-rise-min="riseMin"
        :float-rise-max="riseMax"
        :float-drift-min="driftMin"
        :float-drift-max="driftMax"
        :float-sway-min="swayMin"
        :float-sway-max="swayMax"
        @like="onLike"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import LiveLikeButton from '@components/LiveLikeButton.vue'
import { LikeRequestThrottle } from '@utils/LikeRequestThrottle.js'

const count = ref(10)
const burstSize = ref(1)
const maxParticles = ref(48)
const size = ref(54)
const durationMin = ref(1600)
const durationMax = ref(2200)
const showCount = ref(true)

const waitMs = ref(1800)
const latencyMs = ref(600)
const riseRange = ref(210)
const swayMax = ref(40)
const driftMax = ref(108)

const riseMin = computed(() => Math.round(riseRange.value * 0.78))
const riseMax = computed(() => Math.round(riseRange.value * 1.18))
const swayMin = computed(() => Math.max(6, Math.round(swayMax.value * 0.35)))
const driftMin = computed(() => Math.max(16, Math.round(driftMax.value * 0.28)))

const queued = ref(0)
const sending = ref(false)
let throttle = null

const cssSnippet = computed(
  () => `.live-like {
  --like-size: ${size.value}px;
  --like-emoji-font: 30px;
  --like-float-rise-min: ${riseMin.value}px;
  --like-float-rise-max: ${riseMax.value}px;
  --like-float-drift-max: ${driftMax.value}px;
  --like-float-sway-max: ${swayMax.value}px;
  --like-float-dur-min: ${durationMin.value}ms;
  --like-float-dur-max: ${durationMax.value}ms;
}`,
)

function syncQueued() {
  queued.value = throttle ? throttle.queued : 0
}

function onLike(payload) {
  if (payload && typeof payload === 'object' && 'delta' in payload) {
    throttle?.tap(payload.delta)
    syncQueued()
    return
  }
}

function rebuildThrottle() {
  throttle?.dispose()
  throttle = new LikeRequestThrottle({
    waitMs: waitMs.value,
    latencyMs: latencyMs.value,
    onCommit: async (delta) => {
      sending.value = true
      count.value += delta
      sending.value = false
      syncQueued()
    },
  })
  syncQueued()
}

onMounted(() => {
  rebuildThrottle()
})

watch([waitMs, latencyMs], () => {
  rebuildThrottle()
})

onUnmounted(() => {
  throttle?.dispose()
  throttle = null
})
</script>

<style>
:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  min-height: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background:
    radial-gradient(circle at 24% 16%, rgba(255, 120, 170, 0.34), transparent 28%),
    radial-gradient(circle at 76% 8%, rgba(98, 179, 255, 0.26), transparent 32%),
    linear-gradient(180deg, #15182b 0%, #11111b 50%, #080910 100%);
  color: #fff;
}

.debug-page {
  min-height: 100vh;
  min-height: 100svh;
  padding: 24px 20px 120px;
}

.debug-header h1 {
  margin: 0 0 8px;
  font-size: 1.35rem;
}

.hint {
  margin: 0 0 8px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.9rem;
}

.log {
  margin: 0;
  font-size: 0.9rem;
  color: #9ad4ff;
}

.log strong {
  color: #fff;
  font-weight: 700;
}

.badge {
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.78rem;
}

.badge.is-sending {
  background: rgba(98, 179, 255, 0.22);
}

.debug-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 20px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  max-width: 520px;
}

.slider {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 6px 12px;
  align-items: center;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.78);
}

.slider span {
  grid-column: 1 / -1;
  color: rgba(255, 255, 255, 0.58);
}

.slider input[type='range'] {
  grid-column: 1 / 2;
  width: 100%;
  accent-color: #7eb8ff;
}

.slider output {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
  min-width: 5.5em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.92);
}

.field.row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
}

.field.row span {
  flex: 0 0 7.5em;
  color: rgba(255, 255, 255, 0.58);
}

.field.row input[type='number'] {
  width: 72px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
}

.field.checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
}

.snippet {
  margin-top: 18px;
  max-width: 520px;
}

.snippet-title {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
}

.snippet-pre {
  margin: 0;
  padding: 12px 14px;
  overflow: auto;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(200, 230, 255, 0.95);
  font-size: 0.72rem;
  line-height: 1.45;
}

.like-dock {
  position: fixed;
  right: max(18px, env(safe-area-inset-right, 0px));
  bottom: max(24px, env(safe-area-inset-bottom, 0px));
  z-index: 10;
}
</style>
