# 直播间点赞动画 Demo

这个仓库包含两个可直接复制使用的示例：

- `demo/live-like-demo.html`：纯静态 HTML 手机端页面，右下角点击点赞后会弹出小表情包动画。
- `components/LiveLikeButton.vue`：Vue 3 单文件组件，适合复制到真实项目中复用。

## 静态页面预览

直接用浏览器打开：

```bash
demo/live-like-demo.html
```

## Vue 组件使用

```vue
<template>
  <LiveLikeButton :count="1280" @like="handleLike" />
</template>

<script setup>
import LiveLikeButton from './components/LiveLikeButton.vue'

function handleLike(nextCount) {
  console.log('liked:', nextCount)
}
</script>
```

常用 props：

- `emojis`：表情包数组。
- `buttonEmoji`：按钮中展示的表情。
- `count`：初始点赞数。
- `showCount`：是否展示点赞数。
- `burstSize`：每次点击弹出的表情数量。
- `maxParticles`：页面上最多保留的动画粒子数量。
- `size`：点赞按钮尺寸。

## 迁移方案：复制到你的项目

### 1. 复制文件

把下面两个文件复制到你的项目中：

```text
components/LiveLikeButton.vue
utils/LikeRequestThrottle.js
```

### 2. 使用最终默认动画参数

组件默认值已经按下面这组 CSS 变量调整好。Vue 组件中通常不需要额外配置；如果你迁移到普通 HTML/CSS，或者自己改写组件样式，可以直接复制：

```css
.live-like {
  --like-size: 54px;
  --like-emoji-font: 30px;
  --like-float-rise-min: 119px;
  --like-float-rise-max: 179px;
  --like-float-drift-max: 38px;
  --like-float-sway-max: 10px;
  --like-float-dur-min: 1350ms;
  --like-float-dur-max: 2550ms;
}
```

如果你想在 Vue 组件上显式传入同样参数，也可以复制：

```vue
<LiveLikeButton
  :size="54"
  :emoji-font-size="30"
  :float-rise-min="119"
  :float-rise-max="179"
  :float-drift-max="38"
  :float-sway-max="10"
  :float-duration-min="1350"
  :float-duration-max="2550"
/>
```

### 3. 接入点赞接口

需求逻辑是：

- 用户点击后动画立即播放。
- 一轮防抖内，第一次点击先让展示数 `+1`。
- 这一轮里继续连点不再合并成多次点赞，也不继续累加数字。
- 接口返回正确点赞总数后，用接口总数覆盖展示数。

可直接复制下面的 Vue 示例：

```vue
<template>
  <LiveLikeButton
    await-server-count
    :count="likeCount"
    @like="handleLike"
  />
</template>

<script setup>
import { onUnmounted, ref } from 'vue'
import LiveLikeButton from './components/LiveLikeButton.vue'
import { LikeRequestThrottle } from './utils/LikeRequestThrottle.js'

const likeCount = ref(1280)

const likeThrottle = new LikeRequestThrottle({
  waitMs: 1800,
  onCommit: async () => {
    // 替换成你的真实接口；接口应返回最新点赞总数。
    const res = await fetch('/api/like', { method: 'POST' })
    const data = await res.json()
    likeCount.value = data.likeCount
  },
})

function handleLike(payload) {
  if (!payload || typeof payload !== 'object' || !('delta' in payload)) return

  if (likeThrottle.tap()) {
    likeCount.value += 1
  }
}

onUnmounted(() => {
  likeThrottle.dispose()
})
</script>
```

如果你暂时没有接口，也可以先这样模拟服务端返回：

```js
let serverLikeCount = likeCount.value

const likeThrottle = new LikeRequestThrottle({
  waitMs: 1800,
  latencyMs: 600,
  onCommit: async () => {
    serverLikeCount += 1
    likeCount.value = serverLikeCount
  },
})
```
