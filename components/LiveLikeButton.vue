<template>
  <div class="live-like" :style="rootStyle">
    <!--
      大拇指替换方式（二选一）：
      1) prop：buttonEmoji="👍" 或任意 emoji / 短文本
      2) 插槽：#icon 内放 <img> / 组件 / SVG，完全自定义
    -->
    <div class="live-like__stage">
      <div class="live-like__float-layer" aria-hidden="true">
        <span
          v-for="item in particles"
          :key="item.id"
          class="live-like__emoji-track"
          :style="item.style"
        >
          <span class="live-like__emoji-sway">
            <span class="live-like__emoji-rise">{{ item.emoji }}</span>
          </span>
        </span>
      </div>

      <button
        class="live-like__button"
        :class="{ 'is-popping': isPopping }"
        type="button"
        :aria-label="ariaLabel"
        @click="sendLike"
      >
        <span class="live-like__icon">
          <slot name="icon">
            <span class="live-like__icon-emoji">{{ buttonEmoji }}</span>
          </slot>
        </span>
      </button>
    </div>

    <p v-if="showCount" class="live-like__count">{{ displayCount }}</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  emojis: {
    type: Array,
    default: () => ['😀', '🤣', '❤️', '😻', '👏', '🤘', '🤩', '👍', '🎈', '💕', '💓', '💚'],
  },
  buttonEmoji: {
    type: String,
    default: '👍',
  },
  count: {
    type: Number,
    default: 0,
  },
  showCount: {
    type: Boolean,
    default: true,
  },
  burstSize: {
    type: Number,
    default: 1,
  },
  maxParticles: {
    type: Number,
    default: 80,
  },
  floatDurationMin: {
    type: Number,
    default: 1350,
  },
  floatDurationMax: {
    type: Number,
    default: 2550,
  },
  particleDelayMax: {
    type: Number,
    default: 120,
  },
  /** 上升高度随机范围（px） */
  floatRiseMin: {
    type: Number,
    default: 119,
  },
  floatRiseMax: {
    type: Number,
    default: 179,
  },
  /** 终点水平漂移（px），正负由粒子随机 */
  floatDriftMin: {
    type: Number,
    default: 10,
  },
  floatDriftMax: {
    type: Number,
    default: 38,
  },
  /** 途中左右晃动幅度（px） */
  floatSwayMin: {
    type: Number,
    default: 4,
  },
  floatSwayMax: {
    type: Number,
    default: 10,
  },
  emojiFontSize: {
    type: Number,
    default: 30,
  },
  /**
   * true：不本地改数；emit('like') 由父级立刻乐观 +1，并按防抖只发一次同步请求，接口返回后再改 :count
   * false：本地 +1 并 emit 当前总数 number（默认）
   */
  awaitServerCount: {
    type: Boolean,
    default: false,
  },
  ariaLabel: {
    type: String,
    default: '点赞直播间',
  },
  size: {
    type: Number,
    default: 54,
  },
})

const emit = defineEmits(['like'])

const particles = ref([])
const localCount = ref(props.count)
const isPopping = ref(false)
let particleId = 0
let popTimer = 0
let popFrame = 0
const cleanupTimers = new Set()

const displayCount = computed(() => formatCount(localCount.value))

const rootStyle = computed(() => ({
  '--like-size': `${props.size}px`,
  '--like-emoji-font': `${props.emojiFontSize}px`,
  '--like-float-rise-min': `${props.floatRiseMin}px`,
  '--like-float-rise-max': `${props.floatRiseMax}px`,
  '--like-float-drift-max': `${props.floatDriftMax}px`,
  '--like-float-sway-max': `${props.floatSwayMax}px`,
  '--like-float-dur-min': `${props.floatDurationMin}ms`,
  '--like-float-dur-max': `${props.floatDurationMax}ms`,
}))

function sendLike() {
  if (!props.awaitServerCount) {
    localCount.value += 1
    emit('like', localCount.value)
  } else {
    emit('like', { delta: 1 })
  }

  playButtonPop()

  const nextParticles = Array.from({ length: props.burstSize }, createParticle)
  particles.value = [...particles.value, ...nextParticles].slice(-props.maxParticles)

  const maxLife =
    props.floatDurationMax +
    (props.burstSize > 1 ? props.particleDelayMax : 0) +
    380
  const cleanupTimer = window.setTimeout(() => {
    const expiredIds = new Set(nextParticles.map((item) => item.id))
    particles.value = particles.value.filter((item) => !expiredIds.has(item.id))
    cleanupTimers.delete(cleanupTimer)
  }, maxLife)
  cleanupTimers.add(cleanupTimer)
}

function createParticle() {
  const id = particleId++
  const direction = Math.random() > 0.5 ? 1 : -1
  const loD = Math.min(props.floatDriftMin, props.floatDriftMax)
  const hiD = Math.max(props.floatDriftMin, props.floatDriftMax)
  const drift = rand(loD, hiD) * direction

  const loR = Math.min(props.floatRiseMin, props.floatRiseMax)
  const hiR = Math.max(props.floatRiseMin, props.floatRiseMax)
  const lift = rand(loR, hiR)

  const loS = Math.min(props.floatSwayMin, props.floatSwayMax)
  const hiS = Math.max(props.floatSwayMin, props.floatSwayMax)
  const sway = rand(loS, hiS)

  const rotate = rand(-18, 18)
  const scale = rand(0.84, 1.12)
  const lo = Math.min(props.floatDurationMin, props.floatDurationMax)
  const hi = Math.max(props.floatDurationMin, props.floatDurationMax)
  const duration = rand(lo, hi)
  const delayMax = props.burstSize > 1 ? props.particleDelayMax : 0
  const delay = rand(0, delayMax)
  const fs = rand(props.emojiFontSize * 0.88, props.emojiFontSize * 1.08)

  return {
    id,
    emoji: props.emojis[Math.floor(Math.random() * props.emojis.length)] || props.buttonEmoji,
    style: {
      '--x': `${drift}px`,
      '--y': `-${lift}px`,
      '--sway': `${sway}px`,
      '--r': `${rotate}deg`,
      '--s': scale,
      '--d': `${duration}ms`,
      '--delay': `${delay}ms`,
      '--fs': `${fs}px`,
    },
  }
}

function rand(min, max) {
  return Math.random() * (max - min) + min
}

function playButtonPop() {
  isPopping.value = false
  window.clearTimeout(popTimer)
  window.cancelAnimationFrame(popFrame)
  popFrame = window.requestAnimationFrame(() => {
    isPopping.value = true
    popTimer = window.setTimeout(() => {
      isPopping.value = false
    }, 360)
  })
}

function formatCount(value) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  }

  return String(value)
}

watch(
  () => props.count,
  (count) => {
    localCount.value = count
  },
)

onBeforeUnmount(() => {
  window.clearTimeout(popTimer)
  window.cancelAnimationFrame(popFrame)
  cleanupTimers.forEach((timer) => window.clearTimeout(timer))
  cleanupTimers.clear()
})
</script>

<style scoped>
/* 迁移到纯 CSS 时：把下面变量挂到 .live-like 同节点即可（与 rootStyle 一致） */
.live-like {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: var(--like-size);
}

.live-like__stage {
  position: relative;
  width: var(--like-size);
  height: var(--like-size);
}

.live-like__float-layer {
  pointer-events: none;
  position: absolute;
  inset: 0;
  overflow: visible;
}

.live-like__emoji-track {
  position: absolute;
  right: 9px;
  bottom: 8px;
  z-index: 1;
  font-size: var(--fs, var(--like-emoji-font, 30px));
  line-height: 1;
  pointer-events: none;
}

/* 水平：左右晃动并逐渐收束到终点 var(--x) */
.live-like__emoji-sway {
  display: block;
  animation: live-like-sway-x var(--d) var(--delay) linear forwards;
  will-change: transform;
}

/* 垂直：前快后慢（关键帧时间分布模拟 ease-out）+ 涌现缩放 + 淡出 */
.live-like__emoji-rise {
  display: block;
  text-shadow: 0 5px 15px rgba(0, 0, 0, 0.28);
  animation: live-like-rise-y var(--d) var(--delay) linear forwards;
  will-change: transform, opacity, filter;
}

.live-like__button {
  appearance: none;
  position: relative;
  z-index: 2;
  display: grid;
  width: var(--like-size);
  height: var(--like-size);
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(42, 44, 52, 0.42);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}

.live-like__button:active {
  transform: scale(0.92);
  background: rgba(52, 54, 62, 0.55);
}

.live-like__button.is-popping {
  animation: live-like-button-pop 360ms ease;
}

.live-like__icon {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}

.live-like__icon-emoji {
  display: block;
  font-size: calc(var(--like-size) * 0.46);
  line-height: 1;
  filter: grayscale(1) brightness(1.05) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

.live-like__count {
  margin: 0;
  min-width: 2.5em;
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.02em;
}

@keyframes live-like-sway-x {
  0% {
    transform: translateX(0);
  }

  14% {
    transform: translateX(calc(var(--sway) * 1.05));
  }

  32% {
    transform: translateX(calc(var(--sway) * -0.88));
  }

  52% {
    transform: translateX(calc(var(--sway) * 0.62));
  }

  72% {
    transform: translateX(calc(var(--sway) * -0.32));
  }

  88% {
    transform: translateX(calc(var(--x) * 0.55));
  }

  100% {
    transform: translateX(var(--x));
  }
}

@keyframes live-like-rise-y {
  0% {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(18px) scale(0.22) rotate(calc(var(--r) * -0.55));
  }

  10% {
    opacity: 1;
    filter: blur(0);
    transform: translateY(4px) scale(1.22) rotate(calc(var(--r) * 0.4));
  }

  18% {
    transform: translateY(0) scale(1) rotate(var(--r));
  }

  /* 前半段位移多：上升快 */
  28% {
    opacity: 1;
    transform: translateY(calc(var(--y) * 0.16)) scale(var(--s)) rotate(var(--r));
  }

  44% {
    opacity: 1;
    transform: translateY(calc(var(--y) * 0.38)) scale(calc(var(--s) * 1.02)) rotate(calc(var(--r) * -0.22));
  }

  62% {
    opacity: 1;
    transform: translateY(calc(var(--y) * 0.58)) scale(calc(var(--s) * 0.98)) rotate(calc(var(--r) * 0.12));
  }

  78% {
    opacity: 0.82;
    transform: translateY(calc(var(--y) * 0.76)) scale(calc(var(--s) * 0.9)) rotate(calc(var(--r) * -0.08));
  }

  92% {
    opacity: 0.35;
    transform: translateY(calc(var(--y) * 0.92)) scale(calc(var(--s) * 0.78)) rotate(calc(var(--r) * 0.06));
  }

  100% {
    opacity: 0;
    filter: blur(0.5px);
    transform: translateY(var(--y)) scale(0.66) rotate(calc(var(--r) * 0.25));
  }
}

@keyframes live-like-button-pop {
  0%,
  100% {
    transform: scale(1);
  }

  42% {
    transform: scale(1.14);
  }
}
</style>
