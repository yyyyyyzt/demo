<template>
  <router-view />
</template>

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
</style>
