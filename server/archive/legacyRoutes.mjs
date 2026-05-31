/**
 * 历史 API（IM 先审后发、presubmit 数字人任务链、观众待审队列等）。
 * 默认不挂载；设置 ARCHIVE_LEGACY=1 后由 server/index.mjs 加载。
 */
import { v4 as uuidv4 } from 'uuid'
import { imSendGroupTextAsUser } from '../../archive/server/imRest.mjs'
import { runDigitalHumanPipeline } from '../ivhPipeline.mjs'
import { ivhSendText } from '../ivhApaas.mjs'

export function mountLegacyRoutes(app, ctx) {
  const {
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
  } = ctx

  app.post('/api/rooms/:id/audience/pending-comments', (req, res) => {
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
    const senderLabel =
      String(req.body?.sender_label || req.body?.sender || '观众').trim().slice(0, 64) || '观众'
    const id = `aud_${uuidv4().replace(/-/g, '').slice(0, 16)}`
    const item = {
      id,
      text: text.slice(0, 2000),
      senderLabel,
      createdAt: new Date().toISOString(),
    }
    const list = getPendingAudienceList(room.id)
    list.unshift(item)
    while (list.length > PENDING_AUDIENCE_MAX) list.pop()
    pendingAudienceComments.set(room.id, list)
    res.status(201).json(item)
  })

  app.get('/api/rooms/:id/audience/pending-comments', (req, res) => {
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    res.json({ items: getPendingAudienceList(room.id) })
  })

  app.delete('/api/rooms/:id/audience/pending-comments/:commentId', (req, res) => {
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const removed = takePendingAudienceById(room.id, req.params.commentId)
    if (!removed) {
      res.status(404).json({ error: '待审评论不存在或已处理' })
      return
    }
    res.json({ ok: true, removed })
  })

  app.post('/api/rooms/:id/audience/pending-comments/:commentId/approve-display', (req, res) => {
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const item = takePendingAudienceById(room.id, req.params.commentId)
    if (!item) {
      res.status(404).json({ error: '待审评论不存在或已处理' })
      return
    }
    const pubId = `pub_${uuidv4().replace(/-/g, '').slice(0, 16)}`
    const pubItem = {
      id: pubId,
      text: item.text,
      senderLabel: item.senderLabel,
      approvedAt: new Date().toISOString(),
    }
    const pubList = publicAudienceMessages.get(room.id) || []
    pubList.unshift(pubItem)
    while (pubList.length > PUBLIC_AUDIENCE_MAX) pubList.pop()
    publicAudienceMessages.set(room.id, pubList)
    res.json({ ok: true, item: pubItem })
  })

  app.get('/api/rooms/:id/audience/public-messages', (req, res) => {
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    res.json({ items: publicAudienceMessages.get(room.id) || [] })
  })

  app.post('/api/rooms/:id/barrage/approve-publish', async (req, res) => {
    try {
      if (!IM_REST_ADMIN_USER_ID) {
        res.status(503).json({
          error:
            '未配置 IM_REST_ADMIN_USER_ID。请在 IM 控制台创建 App 管理员账号，并在 .env 中填写该 userId。',
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
      source: 'http_queue',
      hint: '已归档：请使用 GET /api/rooms/:id/studio/comments',
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

  function createDhJob(room, fields, pipelineOpts = {}) {
    const jobId = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`
    const job = {
      id: jobId,
      roomId: room.id,
      liveId: room.liveId,
      status: 'pending',
      replyText: null,
      imageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...fields,
    }
    jobs.set(jobId, job)
    roomActiveJob.set(room.id, jobId)
    setImmediate(() => {
      runDigitalHumanPipeline(
        job,
        room,
        {
          genUserSig,
          trtcSdkAppId: String(TRTC_SDK_APP_ID || ''),
          ...pipelineOpts,
        },
        { closePreviousSession: true, keepSessionOpen: process.env.IVH_AUTO_CLOSE_SESSION !== '1' },
      ).catch((e) => {
        job.status = 'failed'
        job.ivhError = job.ivhError || e?.message || String(e)
        job.updatedAt = new Date().toISOString()
      })
    })
    return job
  }

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
        res.status(400).json({ error: 'presubmit_ticket 已过期' })
        return
      }
      presubmitByTicket.delete(presubmitTicket)
      commentId = rec.commentId
      commentText = rec.text
      commentSource = 'presubmit'
    } else if (DH_JOB_REQUIRE_TICKET) {
      res.status(403).json({ error: '已启用 DH_JOB_REQUIRE_TICKET=1，必须先 presubmit' })
      return
    } else {
      commentId = String(req.body?.comment_id || '').trim()
      commentText = String(req.body?.comment_text || '').trim()
      if (!commentId || !commentText) {
        res.status(400).json({ error: '请提供 presubmit_ticket 或 comment_id + comment_text' })
        return
      }
    }

    const job = createDhJob(room, { commentId, commentText, commentSource })
    res.status(201).json(job)
  })

  app.post('/api/rooms/:id/digital-human/manual-job', (req, res) => {
    if (!DH_ALLOW_MANUAL_JOB) {
      res.status(403).json({ error: 'DH_ALLOW_MANUAL_JOB=0' })
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
    const job = createDhJob(room, {
      commentId: `manual_${Date.now()}`,
      commentText,
      commentSource: 'manual_debug',
      ivhUseChat: useChat,
    })
    res.status(201).json(job)
  })

  app.post('/api/rooms/:id/digital-human/job-from-pending', (req, res) => {
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const pendingId = String(req.body?.pending_comment_id || '').trim()
    if (!pendingId) {
      res.status(400).json({ error: 'pending_comment_id 必填' })
      return
    }
    const item = takePendingAudienceById(room.id, pendingId)
    if (!item) {
      res.status(404).json({ error: '待审评论不存在或已被处理' })
      return
    }
    const useChat = req.body?.use_chat === true || req.body?.use_chat === 'true'
    const job = createDhJob(room, {
      commentId: item.id,
      commentText: item.text,
      commentSource: 'pending_queue',
      ivhUseChat: useChat,
    })
    res.status(201).json(job)
  })

  app.post('/api/rooms/:id/digital-human/speak', async (req, res) => {
    if (!DH_ALLOW_MANUAL_JOB) {
      res.status(403).json({ error: 'DH_ALLOW_MANUAL_JOB=0' })
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
      res.status(409).json({ error: '当前无带 SessionId 的活跃任务' })
      return
    }
    if (job.status !== 'image_done') {
      res.status(409).json({ error: `需 status=image_done，当前为 ${job.status}` })
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

  app.post('/api/rooms/:id/dh/start', (req, res) => {
    if (!DH_ALLOW_MANUAL_JOB) {
      res.status(403).json({ error: 'DH_ALLOW_MANUAL_JOB=0' })
      return
    }
    const rooms = loadRooms()
    const room = rooms.find((r) => r.id === req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    const commentText = String(
      req.body?.text ||
        '欢迎来到直播间，我是数字人主播，下面为大家带来一段精彩的直播测试。',
    ).trim()
    const useChat = req.body?.use_chat === true || req.body?.use_chat === 'true'
    const job = createDhJob(room, {
      commentId: `dh_${Date.now()}`,
      commentText,
      commentSource: 'dh_minimal',
      ivhUseChat: useChat,
    })
    res.status(201).json(job)
  })

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
}
