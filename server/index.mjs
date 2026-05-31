/**
 * 交付 Demo REST API：直播间、UserSig、数智人播控（studio/*）。
 * 历史 IM / presubmit / 观众待审等见 server/archive/legacyRoutes.mjs（ARCHIVE_LEGACY=1）。
 */
import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { v4 as uuidv4 } from 'uuid'
import { getIvhEnvDiagnostics } from './ivhApaas.mjs'
import { closeRoomIvhSession } from './ivhPipeline.mjs'

const require = createRequire(import.meta.url)
const { Api: TLSSigApi } = require('tls-sig-api-v2')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001)
const ARCHIVE_LEGACY = process.env.ARCHIVE_LEGACY === '1'

const TRTC_SDK_APP_ID = process.env.TRTC_SDK_APP_ID
const TRTC_SECRET_KEY = process.env.TRTC_SECRET_KEY
const IM_REST_ADMIN_USER_ID = String(process.env.IM_REST_ADMIN_USER_ID || '').trim()

function imGroupIdForRoom(room) {
  const prefix = process.env.IM_GROUP_ID_PREFIX || ''
  const suffix = process.env.IM_GROUP_ID_SUFFIX || ''
  return `${prefix}${room.liveId}${suffix}`
}

/** @type {Map<string, object>} */
const jobs = new Map()
/** room internal id -> latest job id */
const roomActiveJob = new Map()

const PRESUBMIT_TTL_MS = 15 * 60 * 1000
/** @type {Map<string, { roomId: string, commentId: string, text: string, expires: number }>} */
const presubmitByTicket = new Map()

const DH_JOB_REQUIRE_TICKET = process.env.DH_JOB_REQUIRE_TICKET === '1'
const DH_ALLOW_MANUAL_JOB = process.env.DH_ALLOW_MANUAL_JOB !== '0'

/** @type {Map<string, Array<object>>} */
const pendingAudienceComments = new Map()
/** @type {Map<string, Array<object>>} */
const publicAudienceMessages = new Map()
const PENDING_AUDIENCE_MAX = 200
const PUBLIC_AUDIENCE_MAX = 200

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

function getPendingAudienceList(roomInternalId) {
  return pendingAudienceComments.get(roomInternalId) || []
}

function takePendingAudienceById(roomInternalId, commentId) {
  const list = pendingAudienceComments.get(roomInternalId)
  if (!list?.length) return null
  const idx = list.findIndex((x) => x.id === commentId)
  if (idx === -1) return null
  const [item] = list.splice(idx, 1)
  if (!list.length) pendingAudienceComments.delete(roomInternalId)
  else pendingAudienceComments.set(roomInternalId, list)
  return item
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
  const ivh = getIvhEnvDiagnostics()
  res.json({
    ok: true,
    hasTrtcSecret: Boolean(TRTC_SDK_APP_ID && TRTC_SECRET_KEY),
    ivhConfigured: ivh.configured,
    ivhMissingEnvKeys: ivh.missingEnvKeys,
    archiveLegacyEnabled: ARCHIVE_LEGACY,
    deliveryDemo: true,
    studioApi: true,
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

app.get('/api/rooms', (req, res) => {
  const liveId = String(req.query.liveId || '').trim()
  const rooms = loadRooms()
  if (liveId) {
    const room = rooms.find((r) => r.liveId === liveId)
    if (!room) {
      res.status(404).json({ error: '未找到该 liveId 对应的房间' })
      return
    }
    res.json({ room })
    return
  }
  res.json({ rooms })
})

app.post('/api/rooms', (req, res) => {
  const title = String(req.body?.title || '未命名直播间').trim() || '未命名直播间'
  const liveId = `live_${uuidv4().replace(/-/g, '').slice(0, 12)}`
  const room = {
    id: uuidv4(),
    liveId,
    title,
    broadcastStatus: 'idle',
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
    const roleRaw = String(req.body?.role || 'audience')
    const role =
      roleRaw === 'anchor'
        ? 'anchor'
        : roleRaw === 'moderator'
          ? 'moderator'
          : roleRaw === 'monitor'
            ? 'monitor'
            : 'audience'

    const safeLiveKey = String(room.liveId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36)

    let userId = String(req.body?.userId || '').trim()
    if (!userId) {
      if (role === 'anchor') userId = `anchor_${safeLiveKey}`.slice(0, 48)
      else if (role === 'moderator') userId = `mod_${safeLiveKey}`.slice(0, 48)
      else if (role === 'monitor') userId = `monitor_${uuidv4().replace(/-/g, '').slice(0, 8)}`
      else userId = `viewer_${uuidv4().replace(/-/g, '').slice(0, 12)}`
    }
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

async function stopRoomDigitalHuman(req, res) {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const result = await closeRoomIvhSession(room.id)
  const jobId = roomActiveJob.get(room.id)
  const job = jobId ? jobs.get(jobId) : null
  if (job) {
    job.ivhClosed = true
    job.updatedAt = new Date().toISOString()
  }
  roomActiveJob.delete(room.id)
  room.broadcastStatus = 'idle'
  const idx = rooms.findIndex((r) => r.id === room.id)
  if (idx !== -1) {
    rooms[idx] = { ...rooms[idx], broadcastStatus: 'idle' }
    saveRooms(rooms)
  }
  res.json({ ok: true, ...result, job: job || null })
}

if (ARCHIVE_LEGACY) {
  const { mountLegacyRoutes } = await import('./archive/legacyRoutes.mjs')
  mountLegacyRoutes(app, {
    loadRooms,
    genUserSig,
    TRTC_SDK_APP_ID,
    TRTC_SECRET_KEY,
    IM_REST_ADMIN_USER_ID,
    imGroupIdForRoom,
    jobs,
    roomActiveJob,
    presubmitByTicket,
    PRESUBMIT_TTL_MS,
    DH_JOB_REQUIRE_TICKET,
    DH_ALLOW_MANUAL_JOB,
    pendingAudienceComments,
    publicAudienceMessages,
    getPendingAudienceList,
    takePendingAudienceById,
    PENDING_AUDIENCE_MAX,
    PUBLIC_AUDIENCE_MAX,
    stopRoomDigitalHuman,
  })
  console.log('[api] ARCHIVE_LEGACY=1：已挂载历史端点')
}

app.listen(PORT, () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
})

export {
  app,
  loadRooms,
  saveRooms,
  genUserSig,
  jobs,
  roomActiveJob,
  stopRoomDigitalHuman,
  TRTC_SDK_APP_ID,
}
