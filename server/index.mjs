/**
 * Demo REST API：直播间、UserSig、IM 弹幕（先审后代发）、数字人任务（IVH / 占位）、评论 presubmit。
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
import { getIvhEnvDiagnostics, ivhSendText } from './ivhApaas.mjs'
import { imSendGroupTextAsUser } from './imRest.mjs'
import { closeRoomIvhSession, runDigitalHumanPipeline } from './ivhPipeline.mjs'

const require = createRequire(import.meta.url)
const { Api: TLSSigApi } = require('tls-sig-api-v2')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001)

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

/** 数字人任务：评论正文服务端暂存（一次性 ticket），避免仅信任浏览器 body 中的 comment_text */
const PRESUBMIT_TTL_MS = 15 * 60 * 1000
/** @type {Map<string, { roomId: string, commentId: string, text: string, expires: number }>} */
const presubmitByTicket = new Map()

const DH_JOB_REQUIRE_TICKET = process.env.DH_JOB_REQUIRE_TICKET === '1'
/** 手动调试：POST .../manual-job、.../speak；生产可设 DH_ALLOW_MANUAL_JOB=0 */
const DH_ALLOW_MANUAL_JOB = process.env.DH_ALLOW_MANUAL_JOB !== '0'

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
    ivhEnvFileHint: '在仓库根目录复制 .env.example 为 .env，填写 IVH_* 后重启 API 进程',
    ivhDocsSigning: 'https://cloud.tencent.com/document/product/1240/107197',
    ivhConsoleKeys: 'https://xiaowei.cloud.tencent.com/ivh#/asserts_management',
    dhJobRequireTicket: DH_JOB_REQUIRE_TICKET,
    dhAllowManualJob: DH_ALLOW_MANUAL_JOB,
    imApprovePublishConfigured: Boolean(TRTC_SDK_APP_ID && TRTC_SECRET_KEY && IM_REST_ADMIN_USER_ID),
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
    const roleRaw = String(req.body?.role || 'audience')
    const role =
      roleRaw === 'anchor' ? 'anchor' : roleRaw === 'moderator' ? 'moderator' : 'audience'

    const safeLiveKey = String(room.liveId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36)

    let userId = String(req.body?.userId || '').trim()
    if (!userId) {
      if (role === 'anchor') userId = `anchor_${safeLiveKey}`.slice(0, 48)
      else if (role === 'moderator') userId = `mod_${safeLiveKey}`.slice(0, 48)
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

app.post('/api/rooms/:id/barrage/approve-publish', async (req, res) => {
  try {
    if (!IM_REST_ADMIN_USER_ID) {
      res.status(503).json({
        error:
          '未配置 IM_REST_ADMIN_USER_ID。请在 IM 控制台创建 App 管理员账号，并在 .env 中填写该 userId（与 TRTC 同 SDKAppID 下签发 UserSig）。',
      })
      return
    }
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const sequence = Number(req.body?.sequence)
    const timestampInSecond = Number(req.body?.timestamp_in_second)
    const senderUserId = String(req.body?.sender_user_id || '').trim()
    const text = String(req.body?.text || '').trim()
    if (!Number.isFinite(sequence) || !Number.isFinite(timestampInSecond) || !senderUserId || !text) {
      res.status(400).json({ error: 'sequence、timestamp_in_second、sender_user_id、text 必填' })
      return
    }
    const groupId = imGroupIdForRoom(room)
    await imSendGroupTextAsUser({
      sdkAppId: TRTC_SDK_APP_ID,
      secretKey: TRTC_SECRET_KEY,
      adminUserId: IM_REST_ADMIN_USER_ID,
      groupId,
      fromAccount: senderUserId,
      text: text.slice(0, 2000),
      cloudCustomData: {
        audit: 'public',
        srcSequence: sequence,
        srcTimestamp: timestampInSecond,
      },
    })
    res.json({ ok: true, groupId })
  } catch (e) {
    const code = e.statusCode || 500
    res.status(code).json({ error: e.message || String(e), imCode: e.imCode })
  }
})

app.get('/api/rooms/:id/comments', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  res.json({
    items: [],
    nextCursor: null,
    source: 'im',
    hint: '评论由 TUILiveKit 弹幕（腾讯云 IM）下发，请使用观众端发送、主播页「连接评论管理」查看。',
  })
})

app.post('/api/rooms/:id/digital-human/comment-presubmit', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const sequence = Number(req.body?.sequence)
  const timestampInSecond = Number(req.body?.timestamp_in_second)
  const senderUserId = String(req.body?.sender_user_id || '').trim()
  const text = String(req.body?.text || '').trim()
  if (!Number.isFinite(sequence) || !Number.isFinite(timestampInSecond) || !senderUserId || !text) {
    res
      .status(400)
      .json({ error: 'sequence、timestamp_in_second、sender_user_id、text 必填且为合法数值/非空字符串' })
    return
  }
  const now = Date.now()
  if (presubmitByTicket.size > 400) {
    for (const [k, v] of presubmitByTicket) {
      if (v.expires < now) presubmitByTicket.delete(k)
    }
  }
  const commentId = `im_${sequence}_${senderUserId}_${timestampInSecond}`
  const ticket = `pre_${uuidv4().replace(/-/g, '')}`
  presubmitByTicket.set(ticket, {
    roomId: room.id,
    commentId,
    text: text.slice(0, 2000),
    expires: Date.now() + PRESUBMIT_TTL_MS,
  })
  res.status(201).json({
    ticket,
    comment_id: commentId,
    expires_in_ms: PRESUBMIT_TTL_MS,
  })
})

app.post('/api/rooms/:id/digital-human/jobs', (req, res) => {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const presubmitTicket = String(req.body?.presubmit_ticket || '').trim()
  let commentId = ''
  let commentText = ''
  let commentSource = 'client_body'

  if (presubmitTicket) {
    const rec = presubmitByTicket.get(presubmitTicket)
    if (!rec || rec.roomId !== room.id) {
      res.status(400).json({ error: 'presubmit_ticket 无效' })
      return
    }
    if (rec.expires < Date.now()) {
      presubmitByTicket.delete(presubmitTicket)
      res.status(400).json({ error: 'presubmit_ticket 已过期，请重新在控制台预提交' })
      return
    }
    presubmitByTicket.delete(presubmitTicket)
    commentId = rec.commentId
    commentText = rec.text
    commentSource = 'presubmit'
  } else if (DH_JOB_REQUIRE_TICKET) {
    res.status(403).json({
      error: '已启用 DH_JOB_REQUIRE_TICKET=1，必须先调用 POST .../comment-presubmit 再携带 presubmit_ticket 创建任务',
    })
    return
  } else {
    commentId = String(req.body?.comment_id || '').trim()
    commentText = String(req.body?.comment_text || '').trim()
    if (!commentId || !commentText) {
      res.status(400).json({ error: '请提供 presubmit_ticket，或（开发模式）同时提供 comment_id 与 comment_text' })
      return
    }
  }

  const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`
  const job = {
    id: jobId,
    roomId: room.id,
    liveId: room.liveId,
    commentId,
    commentText,
    commentSource,
    status: 'pending',
    replyText: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  jobs.set(jobId, job)
  roomActiveJob.set(room.id, jobId)
  setImmediate(() => {
    runDigitalHumanPipeline(job, room, {
      genUserSig,
      trtcSdkAppId: String(TRTC_SDK_APP_ID || ''),
    }).catch((e) => {
      job.status = 'failed'
      job.ivhError = job.ivhError || e?.message || String(e)
      job.updatedAt = new Date().toISOString()
    })
  })
  res.status(201).json(job)
})

/** 不经过评论 presubmit，直接排队一条数字人任务（学习/联调用；默认开启） */
app.post('/api/rooms/:id/digital-human/manual-job', (req, res) => {
  if (!DH_ALLOW_MANUAL_JOB) {
    res.status(403).json({ error: 'DH_ALLOW_MANUAL_JOB=0 已关闭手动调试接口' })
    return
  }
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const commentText = String(req.body?.text || '').trim()
  if (!commentText) {
    res.status(400).json({ error: 'text 必填' })
    return
  }
  const useChat = req.body?.use_chat === true || req.body?.use_chat === 'true'
  const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`
  const job = {
    id: jobId,
    roomId: room.id,
    liveId: room.liveId,
    commentId: `manual_${Date.now()}`,
    commentText,
    commentSource: 'manual_debug',
    ivhUseChat: useChat,
    status: 'pending',
    replyText: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  jobs.set(jobId, job)
  roomActiveJob.set(room.id, jobId)
  setImmediate(() => {
    runDigitalHumanPipeline(job, room, {
      genUserSig,
      trtcSdkAppId: String(TRTC_SDK_APP_ID || ''),
    }).catch((e) => {
      job.status = 'failed'
      job.ivhError = job.ivhError || e?.message || String(e)
      job.updatedAt = new Date().toISOString()
    })
  })
  res.status(201).json(job)
})

/** 对当前房间仍保持的数智人会话再发一句（多轮）；需任务 status=image_done */
app.post('/api/rooms/:id/digital-human/speak', async (req, res) => {
  if (!DH_ALLOW_MANUAL_JOB) {
    res.status(403).json({ error: 'DH_ALLOW_MANUAL_JOB=0 已关闭手动调试接口' })
    return
  }
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const text = String(req.body?.text || '').trim()
  if (!text) {
    res.status(400).json({ error: 'text 必填' })
    return
  }
  const useChat = req.body?.use_chat === true || req.body?.use_chat === 'true'
  const jobId = roomActiveJob.get(room.id)
  const job = jobId ? jobs.get(jobId) : null
  if (!job?.ivhSessionId) {
    res.status(409).json({ error: '当前无带 SessionId 的活跃任务，请先完成一次数字人任务' })
    return
  }
  if (job.status !== 'image_done') {
    res.status(409).json({ error: `请等待首条任务完成（需 status=image_done，当前为 ${job.status}）` })
    return
  }
  try {
    await ivhSendText(job.ivhSessionId, text, { useChat })
    job.replyText = text.slice(0, 400)
    job.updatedAt = new Date().toISOString()
    res.json({ ok: true, job })
  } catch (e) {
    const code = e.statusCode || 502
    res.status(code).json({ error: e.message || String(e), ivhHeader: e.ivhHeader })
  }
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

/** 最精简 demo：开始一条数字人测试任务（同 manual-job，但路径更短，便于「点击按钮」一键发起） */
app.post('/api/rooms/:id/dh/start', (req, res) => {
  if (!DH_ALLOW_MANUAL_JOB) {
    res.status(403).json({ error: 'DH_ALLOW_MANUAL_JOB=0 已关闭手动调试接口' })
    return
  }
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === req.params.id)
  if (!room) {
    res.status(404).json({ error: '房间不存在' })
    return
  }
  const commentText = String(req.body?.text || '欢迎来到直播间，我是数字人主播，下面为大家带来一段精彩的直播测试。').trim()
  const useChat = req.body?.use_chat === true || req.body?.use_chat === 'true'
  const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`
  const job = {
    id: jobId,
    roomId: room.id,
    liveId: room.liveId,
    commentId: `dh_${Date.now()}`,
    commentText,
    commentSource: 'dh_minimal',
    ivhUseChat: useChat,
    status: 'pending',
    replyText: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  jobs.set(jobId, job)
  roomActiveJob.set(room.id, jobId)
  setImmediate(() => {
    runDigitalHumanPipeline(job, room, {
      genUserSig,
      trtcSdkAppId: String(TRTC_SDK_APP_ID || ''),
    }).catch((e) => {
      job.status = 'failed'
      job.ivhError = job.ivhError || e?.message || String(e)
      job.updatedAt = new Date().toISOString()
    })
  })
  res.status(201).json(job)
})

/** 主动停止当前房间数字人会话；释放并发，前端「停止数字人」按钮使用 */
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
  res.json({ ok: true, ...result, job: job || null })
}

app.post('/api/rooms/:id/dh/stop', stopRoomDigitalHuman)
app.post('/api/rooms/:id/digital-human/stop-session', stopRoomDigitalHuman)

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
