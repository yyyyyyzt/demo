<template>
  <div class="home">
    <header class="home__header">
      <h1 class="home__title">观众端（预留）</h1>
      <p class="home__desc">
        此路由为「TRTC / TUIKit 官方 UI 观众进房」主站占位，将在阶段 1 接入真实看播能力。详见仓库根目录
        <code>progress.md</code>。
      </p>
    </header>
    <nav class="home__nav" aria-label="相关入口">
      <RouterLink class="home__link home__link--primary" to="/legacy">历史调试页（点赞 + 腾讯观众 JSON）</RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  min-height: 100svh;
  padding: max(24px, env(safe-area-inset-top)) 20px max(32px, env(safe-area-inset-bottom));
  max-width: 28rem;
  margin: 0 auto;
}

.home__header {
  margin-bottom: 1.25rem;
}

.home__title {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.home__desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.72);
}

.home__desc code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.82em;
}

.home__nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.home__link {
  display: block;
  padding: 14px 16px;
  border-radius: 12px;
  text-align: center;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.06);
}

.home__link--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4f8dff 0%, #7e5bff 100%);
  color: #fff;
}
</style>
