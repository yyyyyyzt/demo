import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MINIMAL_LIVE_BROADCAST = 'minimal-live-broadcast.html'
const minimalLiveBroadcastAbs = () => path.join(__dirname, 'demo', MINIMAL_LIVE_BROADCAST)

/** 开发/构建均提供与仓库 demo 同源的 Canvas 开播页（避免重复维护两份 HTML） */
function minimalLiveBroadcastHtmlPlugin() {
  return {
    name: 'minimal-live-broadcast-html',
    configureServer(server) {
      server.middlewares.use(`/${MINIMAL_LIVE_BROADCAST}`, (req, res, next) => {
        if (req.method !== 'GET') {
          next()
          return
        }
        try {
          const html = fs.readFileSync(minimalLiveBroadcastAbs(), 'utf8')
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (e) {
          next(e)
        }
      })
    },
    writeBundle(outputOptions) {
      const dir = outputOptions.dir
      if (!dir) return
      try {
        fs.copyFileSync(minimalLiveBroadcastAbs(), path.join(dir, MINIMAL_LIVE_BROADCAST))
      } catch (e) {
        console.warn('[minimal-live-broadcast-html] copy failed:', e)
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), minimalLiveBroadcastHtmlPlugin()],
  root: path.join(__dirname, 'playground'),
  resolve: {
    alias: {
      '@components': path.join(__dirname, 'components'),
      '@utils': path.join(__dirname, 'utils'),
      '@examples': path.join(__dirname, 'examples'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
