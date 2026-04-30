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
