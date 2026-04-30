<template>
  <div class="live-like" :style="rootStyle">
    <div class="live-like__float-layer" aria-hidden="true">
      <span
        v-for="item in particles"
        :key="item.id"
        class="live-like__emoji"
        :style="item.style"
      >
        {{ item.emoji }}
      </span>
    </div>

    <button
      class="live-like__button"
      :class="{ 'is-popping': isPopping }"
      type="button"
      :aria-label="ariaLabel"
      @click="sendLike"
    >
      <span class="live-like__icon">{{ buttonEmoji }}</span>
      <span v-if="showCount" class="live-like__count">{{ displayCount }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  emojis: {
    type: Array,
    default: () => ['😀', '🤣', '❤️', '😻', '👏', '🤘', '🤩', '👍🏼', '🎈', '💕', '💓', '💚'],
  },
  buttonEmoji: {
    type: String,
    default: '👍🏼',
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
    default: 8,
  },
  maxParticles: {
    type: Number,
    default: 80,
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
}))

function sendLike() {
  localCount.value += 1
  emit('like', localCount.value)

  playButtonPop()

  const nextParticles = Array.from({ length: props.burstSize }, createParticle)
  particles.value = [...particles.value, ...nextParticles].slice(-props.maxParticles)

  const cleanupTimer = window.setTimeout(() => {
    const expiredIds = new Set(nextParticles.map((item) => item.id))
    particles.value = particles.value.filter((item) => !expiredIds.has(item.id))
    cleanupTimers.delete(cleanupTimer)
  }, 2200)
  cleanupTimers.add(cleanupTimer)
}

function createParticle() {
  const id = particleId++
  const direction = Math.random() > 0.5 ? 1 : -1
  const drift = rand(22, 86) * direction
  const lift = rand(145, 230)
  const rotate = rand(-24, 24)
  const scale = rand(0.74, 1.18)
  const duration = rand(1450, 2050)
  const delay = rand(0, 110)

  return {
    id,
    emoji: props.emojis[Math.floor(Math.random() * props.emojis.length)] || props.buttonEmoji,
    style: {
      '--x': `${drift}px`,
      '--y': `-${lift}px`,
      '--r': `${rotate}deg`,
      '--s': scale,
      '--d': `${duration}ms`,
      '--delay': `${delay}ms`,
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
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`
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
.live-like {
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

.live-like__emoji {
  position: absolute;
  right: 9px;
  bottom: 8px;
  z-index: 1;
  font-size: 30px;
  line-height: 1;
  opacity: 0;
  text-shadow: 0 5px 15px rgba(0, 0, 0, 0.28);
  transform: translate3d(0, 0, 0) scale(0.5) rotate(0deg);
  transform-origin: 50% 75%;
  animation: live-like-float var(--d) var(--delay) cubic-bezier(0.17, 0.67, 0.27, 1) forwards;
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
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 50%;
  color: #fff;
  background:
    radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0) 24%),
    linear-gradient(145deg, rgba(255, 89, 118, 0.96), rgba(255, 52, 104, 0.9) 58%, rgba(255, 126, 46, 0.95));
  box-shadow:
    0 12px 26px rgba(255, 70, 103, 0.28),
    inset 0 -4px 10px rgba(105, 0, 28, 0.18);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.live-like__button:active {
  transform: scale(0.9);
  box-shadow:
    0 8px 20px rgba(255, 70, 103, 0.22),
    inset 0 -3px 8px rgba(105, 0, 28, 0.2);
}

.live-like__button.is-popping {
  animation: live-like-button-pop 360ms ease;
}

.live-like__icon {
  display: block;
  font-size: calc(var(--like-size) * 0.48);
  filter: drop-shadow(0 3px 5px rgba(107, 0, 35, 0.28));
}

.live-like__count {
  position: absolute;
  right: -3px;
  bottom: -7px;
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  color: #ff496f;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.16);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

@keyframes live-like-float {
  0% {
    opacity: 0;
    filter: blur(0);
    transform: translate3d(0, 0, 0) scale(0.35) rotate(calc(var(--r) * -0.4));
  }

  12% {
    opacity: 1;
    transform: translate3d(calc(var(--x) * 0.08), -24px, 0) scale(var(--s)) rotate(var(--r));
  }

  62% {
    opacity: 0.96;
    transform: translate3d(calc(var(--x) * 0.82), calc(var(--y) * 0.72), 0) scale(calc(var(--s) * 0.92)) rotate(calc(var(--r) * -0.35));
  }

  100% {
    opacity: 0;
    filter: blur(1px);
    transform: translate3d(var(--x), var(--y), 0) scale(0.52) rotate(calc(var(--r) * 1.4));
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
