/**
 * 交付 Demo 播控 API：评论队列、LLM 回复、播报、开始/结束直播。
 */
import { v4 as uuidv4 } from 'uuid'
import { generateReplyDraft } from './llmReply.mjs'
import {
  broadcastText,
  closeRoomIvhSession,
  ensureIvhSession,
  getRoomIvhSessionMeta,
  runDigitalHumanPipeline,
} from './ivhPipeline.mjs'
import { isIvhConfigured } from './ivhApaas.mjs'
import {
  createTuiLiveRoom,
  destroyTuiLiveRoom,
  isTuiLiveRestConfigured,
} from './tuiLiveRest.mjs'

const TUILIVE_REGISTER_ON_STUDIO = process.env.TUILIVE_REGISTER_ON_STUDIO !== '0'

function anchorOwnerAccount(liveId) {
  const safeLiveKey = String(liveId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36)
  return `anchor_${safeLiveKey}`.slice(0, 48)
}

/** @type {Map<string, Array<object>>} */
const studioCommentsByRoom = new Map()
const STUDIO_COMMENTS_MAX = 200

const STUDIO_WELCOME_TEXT =
  process.env.STUDIO_WELCOME_TEXT ||
  '欢迎来到直播间，我是数字人主播，很高兴为您服务。'

function getCommentList(roomId) {
  if (!studioCommentsByRoom.has(roomId)) {
    studioCommentsByRoom.set(roomId, [])
  }
  return studioCommentsByRoom.get(roomId)
}

/** 解散房间时清理内存中的评论队列 */
export function disposeStudioRoom(roomInternalId) {
  studioCommentsByRoom.delete(roomInternalId)
}

function findRoom(loadRooms, roomParamId) {
  const rooms = loadRooms()
  const room = rooms.find((r) => r.id === roomParamId)
  return { rooms, room }
}

function findComment(roomId, commentId) {
  const list = getCommentList(roomId)
  const c = list.find((x) => x.id === commentId)
  return { list, comment: c }
}

function setRoomBroadcastStatus(rooms, room, status, saveRooms) {
  const idx = rooms.findIndex((r) => r.id === room.id)
  if (idx !== -1) {
    rooms[idx] = { ...rooms[idx], broadcastStatus: status }
    saveRooms(rooms)
  }
  room.broadcastStatus = status
}

function makeJob(room, fields = {}) {
  const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`
  return {
    id: jobId,
    roomId: room.id,
    liveId: room.liveId,
    commentId: fields.commentId || `studio_${Date.now()}`,
    commentText: fields.commentText || '',
    commentSource: fields.commentSource || 'studio',
    status: 'pending',
    replyText: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...fields,
  }
}

export function mountStudioRoutes(app, ctx) {
  const { loadRooms, saveRooms, genUserSig, TRTC_SDK_APP_ID, TRTC_SECRET_KEY, jobs, roomActiveJob } =
    ctx

  const ivhDeps = () => ({
    genUserSig,
    trtcSdkAppId: String(TRTC_SDK_APP_ID || ''),
  })

  app.get('/api/rooms/:id/studio/comments', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    res.json({ items: getCommentList(room.id) })
  })

  app.post('/api/rooms/:id/studio/comments', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const text = String(req.body?.text || '').trim()
    if (!text) {
      res.status(400).json({ error: 'text 必填' })
      return
    }
    const senderLabel =
      String(req.body?.sender_label || req.body?.senderLabel || '演示观众').trim().slice(0, 64) ||
      '演示观众'
    const item = {
      id: `cmt_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      text: text.slice(0, 2000),
      senderLabel,
      createdAt: new Date().toISOString(),
      status: 'pending',
      replyDraft: null,
      replyGeneratedAt: null,
    }
    const list = getCommentList(room.id)
    list.unshift(item)
    while (list.length > STUDIO_COMMENTS_MAX) list.pop()
    res.status(201).json(item)
  })

  app.patch('/api/rooms/:id/studio/comments/:commentId', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const { comment } = findComment(room.id, req.params.commentId)
    if (!comment) {
      res.status(404).json({ error: '评论不存在' })
      return
    }
    const draft = req.body?.reply_draft ?? req.body?.replyDraft
    if (draft !== undefined) {
      comment.replyDraft = String(draft).slice(0, 2000)
      if (comment.replyDraft.trim()) comment.status = 'ready'
    }
    res.json(comment)
  })

  app.post('/api/rooms/:id/studio/comments/:commentId/generate-reply', async (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const { comment } = findComment(room.id, req.params.commentId)
    if (!comment) {
      res.status(404).json({ error: '评论不存在' })
      return
    }
    try {
      const { replyDraft, source, llmError } = await generateReplyDraft({
        commentText: comment.text,
        senderLabel: comment.senderLabel,
      })
      comment.replyDraft = replyDraft
      comment.replyGeneratedAt = new Date().toISOString()
      comment.status = 'ready'
      comment.replySource = source
      res.json({ comment, replyDraft, source, llmError: llmError || null })
    } catch (e) {
      const code = e.statusCode || 500
      res.status(code).json({ error: e.message || String(e) })
    }
  })

  app.post('/api/rooms/:id/studio/comments/:commentId/broadcast', async (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const { comment } = findComment(room.id, req.params.commentId)
    if (!comment) {
      res.status(404).json({ error: '评论不存在' })
      return
    }

    const sessionMeta = getRoomIvhSessionMeta(room.id)
    const text = String(req.body?.text ?? comment.replyDraft ?? '').trim()
    if (!text) {
      res.status(400).json({ error: '无播报文案，请先生成或编辑回复' })
      return
    }
    if (!sessionMeta?.sessionId) {
      res.status(409).json({ error: '请先点击「开始直播」建立数智人会话' })
      return
    }

    try {
      if (!isIvhConfigured()) {
        comment.status = 'broadcasted'
        comment.broadcastedAt = new Date().toISOString()
        res.json({ ok: true, comment, placeholder: true, text })
        return
      }
      await broadcastText(sessionMeta.sessionId, text)
      comment.status = 'broadcasted'
      comment.broadcastedAt = new Date().toISOString()
      comment.lastBroadcastText = text.slice(0, 400)

      const jobId = roomActiveJob.get(room.id)
      let job = jobId ? jobs.get(jobId) : null
      if (job) {
        job.replyText = text.slice(0, 400)
        job.updatedAt = new Date().toISOString()
      }

      res.json({ ok: true, comment, sessionId: sessionMeta.sessionId, text })
    } catch (e) {
      const code = e.statusCode || 502
      res.status(code).json({ error: e.message || String(e), ivhHeader: e.ivhHeader })
    }
  })

  app.get('/api/rooms/:id/studio/session', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const meta = getRoomIvhSessionMeta(room.id)
    const jobId = roomActiveJob.get(room.id)
    const job = jobId ? jobs.get(jobId) : null
    res.json({
      active: Boolean(meta?.sessionId),
      broadcastStatus: room.broadcastStatus || 'idle',
      ivhSessionId: meta?.sessionId || null,
      ivhVirtualmanUserId: meta?.ivhVirtualmanUserId || meta?.ivhUserId || null,
      job: job || null,
    })
  })

  app.post('/api/rooms/:id/studio/start', async (req, res) => {
    const { rooms, room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }

    const welcomeText = String(req.body?.welcome_text || STUDIO_WELCOME_TEXT).trim()
    const job = makeJob(room, {
      commentText: welcomeText,
      commentSource: 'studio_start',
    })
    jobs.set(job.id, job)
    roomActiveJob.set(room.id, job.id)

    let tuiLive = { skipped: true }
    if (TUILIVE_REGISTER_ON_STUDIO && isTuiLiveRestConfigured(TRTC_SDK_APP_ID, TRTC_SECRET_KEY)) {
      try {
        await createTuiLiveRoom({
          sdkAppId: TRTC_SDK_APP_ID,
          secretKey: TRTC_SECRET_KEY,
          liveId: room.liveId,
          title: room.title,
          ownerAccount: anchorOwnerAccount(room.liveId),
        })
        tuiLive = { registered: true, liveId: room.liveId }
      } catch (e) {
        tuiLive = { registered: false, error: e?.message || String(e), code: e?.tuiLiveCode }
      }
    }

    try {
      if (!isIvhConfigured()) {
        job.status = 'image_done'
        job.ivhSessionKeptOpen = true
        job.updatedAt = new Date().toISOString()
        setRoomBroadcastStatus(rooms, room, 'live', saveRooms)
        res.status(201).json({
          job,
          ivhSessionId: null,
          ivhVirtualmanUserId: null,
          placeholder: true,
          tuiLive,
          anchorUserId: anchorOwnerAccount(room.liveId),
        })
        return
      }

      const ensured = await ensureIvhSession(room, ivhDeps())
      job.ivhSessionId = ensured.sessionId
      job.ivhVirtualmanUserId = ensured.ivhUserId
      if (welcomeText) {
        await broadcastText(ensured.sessionId, welcomeText)
        job.replyText = welcomeText.slice(0, 400)
      }
      job.status = 'image_done'
      job.ivhSessionKeptOpen = true
      job.updatedAt = new Date().toISOString()
      setRoomBroadcastStatus(rooms, room, 'live', saveRooms)

      res.status(201).json({
        job,
        ivhSessionId: ensured.sessionId,
        ivhVirtualmanUserId: ensured.ivhVirtualmanUserId,
        reused: ensured.reused,
        tuiLive,
        anchorUserId: anchorOwnerAccount(room.liveId),
      })
    } catch (e) {
      job.status = 'failed'
      job.ivhError = e?.message || String(e)
      job.updatedAt = new Date().toISOString()
      const code = e.statusCode || 502
      res.status(code).json({ error: e.message || String(e), job })
    }
  })

  app.post('/api/rooms/:id/studio/stop', async (req, res) => {
    const { rooms, room } = findRoom(loadRooms, req.params.id)
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
    setRoomBroadcastStatus(rooms, room, 'idle', saveRooms)

    let tuiLive = { skipped: true }
    if (TUILIVE_REGISTER_ON_STUDIO && isTuiLiveRestConfigured(TRTC_SDK_APP_ID, TRTC_SECRET_KEY)) {
      try {
        await destroyTuiLiveRoom({
          sdkAppId: TRTC_SDK_APP_ID,
          secretKey: TRTC_SECRET_KEY,
          liveId: room.liveId,
        })
        tuiLive = { destroyed: true }
      } catch (e) {
        tuiLive = { destroyed: false, error: e?.message || String(e) }
      }
    }

    res.json({ ok: true, ...result, job: job || null, tuiLive })
  })
}
