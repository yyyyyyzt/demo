/**
 * Demo REST API：直播间、UserSig、评论 Mock、数字人任务占位。
 * 生产环境请替换存储与鉴权；密钥仅通过环境变量注入。
 */
import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { v4 as uuidv4 } from 'uuid'

const require = createRequire(import.meta.url)
const { Api: TLSSigApi } = require('tls-sig-api-v2')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001)

const TRTC_SDK_APP_ID = process.env.TRTC_SDK_APP_ID
const TRTC_SECRET_KEY = process.env.TRTC_SECRET_KEY

/** @type {Map<string, object>} */
const jobs = new Map()
/** room internal id -> latest job id */
const roomActiveJob = new Map()

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadRooms() {
  try {
    const raw = fs.readFileSync(ROOMS_FILE, 'utf8')
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveRooms(list) {
  ensureDataDir()
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(list, null, 2), 'utf8')
}

function genUserSig(userId, expireSec = 86400) {
  if (!TRTC_SDK_APP_ID || !TRTC_SECRET_KEY) {
    const err = new Error('缺少 TRTC_SDK_APP_ID 或 TRTC_SECRET_KEY，无法签发 UserSig')
    err.statusCode = 503
    throw err
  }
  const api = new TLSSigApi(Number(TRTC_SDK_APP_ID), TRTC_SECRET_KEY)
  return api.genSig(userId, expireSec)
}

function mockComments(roomId) {
  return [
    {
      id: `c_${roomId}_1`,
      text: '主播好，数字人什么时候上线？',
      user: '观众A',
      source: 'mock',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: `c_${roomId}_2`,
      text: '画面很清晰👍',
      user: '观众B',
      source: 'mock',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    },
    {
      id: `c_${roomId}_3`,
      text: '来首音乐',
      user: '观众C',
      source: 'mock',
      createdAt: new Date(Date.now() - 15_000).toISOString(),
    },
  ]
}

function advanceJob(jobId) {
  const job = jobs.get(jobId)
  if (!job || job.status === 'failed') return
  if (job.status === 'pending') {
    job.status = 'llm_done'
    job.replyText = '（占位）感谢您的评论，我们会持续优化直播体验。'
    job.updatedAt = new Date().toISOString()
    setTimeout(() => advanceJob(jobId), 600)
    return
  }
  if (job.status === 'llm_done') {
    job.status = 'image_done'
    job.imageUrl = 'https://picsum.photos/seed/dhjob/960/540'
    job.updatedAt = new Date().toISOString()
  }
}

const app = express()
app.use(
  cors({
    origin: [/127\.0\.0\.1:\d+$/, /localhost:\d+$/],
    credentials: true,
  }),
)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasTrtcSecret: Boolean(TRTC_SDK_APP_ID && TRTC_SECRET_KEY),
  })
})

app.post('/api/usersig', (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim()
    if (!userId) {
      res.status(400).json({ error: 'userId 必填' })
      return
    }
    const expire = Math.min(Math.max(Number(req.body?.expire) || 86400, 300), 86400 * 30)
    const userSig = genUserSig(userId, expire)
    res.json({
      sdkAppId: Number(TRTC_SDK_APP_ID),
      userId,
      userSig,
      expireSeconds: expire,
    })
  } catch (e) {
    const code = e.statusCode || 500
    res.status(code).json({ error: e.message || String(e) })
  }
})

app.get('/api/rooms', (_req, res) => {
  const rooms = loadRooms()
  res.json({ rooms })
})

app.post('/api/rooms', (req, res) => {
  const title = String(req.body?.title || '未命名直播间').trim() || '未命名直播间'
  const liveId = `live_${uuidv4().replace(/-/g, '').slice(0, 12)}`
  const room = {
    id: uuidv4(),
    liveId,
    title,
    createdAt: new Date().toISOString(),
  }
  const rooms = loadRooms()
  rooms.unshift(room)
  saveRooms(rooms)
  res.status(201).json(room)
})

app.get('/api/rooms/:id', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  res.json(room)
})

app.post('/api/rooms/:id/token', (req, res) => {
  try {
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const role = req.body?.role === 'anchor' ? 'anchor' : 'audience'
    const userId =
      String(req.body?.userId || '').trim() ||
      (role === 'anchor' ? `anchor_${room.liveId}`.slice(0, 48) : `viewer_${uuidv4().replace(/-/g, '').slice(0, 12)}`)
    const expire = Math.min(Math.max(Number(req.body?.expire) || 86400, 300), 86400 * 30)
    const userSig = genUserSig(userId, expire)
    res.json({
      sdkAppId: Number(TRTC_SDK_APP_ID),
      userId,
      userSig,
      role,
      liveId: room.liveId,
      roomTitle: room.title,
      expireSeconds: expire,
    })
  } catch (e) {
    const code = e.statusCode || 500
    res.status(code).json({ error: e.message || String(e) })
  }
})

app.get('/api/rooms/:id/comments', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const items = mockComments(room.id)
  res.json({ items, nextCursor: null })
})

app.post('/api/rooms/:id/digital-human/jobs', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const commentId = String(req.body?.comment_id || '').trim()
  const commentText = String(req.body?.comment_text || '').trim()
  if (!commentId || !commentText) {
    res.status(400).json({ error: 'comment_id 与 comment_text 必填' })
    return
  }
  const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`
  const job = {
    id: jobId,
    roomId: room.id,
    liveId: room.liveId,
    commentId,
    commentText,
    status: 'pending',
    replyText: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  jobs.set(jobId, job)
  roomActiveJob.set(room.id, jobId)
  setTimeout(() => advanceJob(jobId), 500)
  res.status(201).json(job)
})

app.get('/api/rooms/:id/digital-human/jobs/:jobId', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const job = jobs.get(req.params.jobId)
  if (!job || job.roomId !== room.id) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  res.json(job)
})

app.get('/api/rooms/:id/digital-human/active-job', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const jobId = roomActiveJob.get(room.id)
  const job = jobId ? jobs.get(jobId) : null
  res.json({ job: job || null })
})

app.listen(PORT, () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
})
