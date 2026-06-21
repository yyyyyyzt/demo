/**
 * 交付 Demo 播控 API：
 *  - 开始/结束直播（生产模式 rtmp+OBS 拉流转推 / 直连模式 trtc）
 *  - 评论链路：观众发评论 → 真走腾讯 IM 群（保留 MsgSeq）→ 播控台审阅
 *  - 模型回复（LLM 占位/真实）→ 二次编辑 → 数智人播报
 *  - 撤回（IM 撤回）、禁言（IM 禁言）、认领锁定（多管理员协作）
 *  - 演示种子评论（政策宣讲话术）
 */
import { v4 as uuidv4 } from 'uuid'
import { generateReplyDraft } from './llmReply.mjs'
import {
  broadcastText,
  closeRoomIvhSession,
  ensureIvhSession,
  getRoomIvhSessionMeta,
} from './ivhPipeline.mjs'
import { isIvhConfigured } from './ivhApaas.mjs'
import { buildObsPushEndpoint, obsRobotUserId } from './trtcRtmp.mjs'
import {
  imForbidSendMsg,
  imRecallGroupMsg,
  imSendGroupText,
  isImRestConfigured,
} from './imRest.mjs'

const DEFAULT_MUTE_SECONDS = Number(process.env.STUDIO_MUTE_SECONDS || 600)

function anchorOwnerAccount(liveId) {
  return obsRobotUserId(liveId)
}

/** 直播间对应的 IM 群 ID（TUILiveKit create_room 以 liveId 作为 RoomId / 群 ID） */
function imGroupIdForRoom(room) {
  const prefix = process.env.IM_GROUP_ID_PREFIX || ''
  const suffix = process.env.IM_GROUP_ID_SUFFIX || ''
  return `${prefix}${room.liveId}${suffix}`
}

/** @type {Map<string, Array<object>>} */
const studioCommentsByRoom = new Map()
/** 已注入种子评论的房间集合 */
const seededRooms = new Set()
/** @type {Map<string, object>} 房间 → OBS 拉流/推流端点 */
const obsEndpointsByRoom = new Map()
const STUDIO_COMMENTS_MAX = 300

const STUDIO_WELCOME_TEXT =
  process.env.STUDIO_WELCOME_TEXT ||
  '各位观众朋友大家好，欢迎来到本场惠民政策宣讲直播间，我是数字人主播，下面由我为大家解读政策要点。'

/** 政策宣讲场景演示种子评论（一进房即可演示，可自行替换） */
const SEED_COMMENTS = [
  { senderLabel: '街道居民·小李', text: '主播你好，这次的惠民补贴政策具体适用哪些人群呀？' },
  { senderLabel: '退休职工·王阿姨', text: '请问办理需要准备哪些材料？现场办还是网上办？' },
  { senderLabel: '个体户·老陈', text: '申报的时间截止到什么时候？错过了还能补办吗？' },
  { senderLabel: '新市民·张同学', text: '我是刚落户的，想问下线上办理的入口在哪里？' },
]

function getCommentList(roomId) {
  if (!studioCommentsByRoom.has(roomId)) {
    studioCommentsByRoom.set(roomId, [])
  }
  return studioCommentsByRoom.get(roomId)
}

function makeComment(fields = {}) {
  return {
    id: `cmt_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
    text: String(fields.text || '').slice(0, 2000),
    senderLabel: String(fields.senderLabel || '演示观众').slice(0, 64) || '演示观众',
    senderUserId: fields.senderUserId ? String(fields.senderUserId).slice(0, 64) : null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    replyDraft: null,
    replyGeneratedAt: null,
    replySource: null,
    imMsgSeq: fields.imMsgSeq ?? null,
    imRelayed: Boolean(fields.imRelayed),
    imError: fields.imError || null,
    claimedBy: null,
    claimedAt: null,
    recalled: false,
    recalledAt: null,
    muted: false,
    seed: Boolean(fields.seed),
  }
}

function ensureSeedComments(room) {
  if (seededRooms.has(room.id)) return
  seededRooms.add(room.id)
  const list = getCommentList(room.id)
  if (list.length > 0) return
  for (const s of SEED_COMMENTS) {
    list.push(makeComment({ ...s, seed: true }))
  }
}

/** 解散房间时清理内存中的评论队列与端点 */
export function disposeStudioRoom(roomInternalId) {
  studioCommentsByRoom.delete(roomInternalId)
  obsEndpointsByRoom.delete(roomInternalId)
  seededRooms.delete(roomInternalId)
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

  const imConfigured = () => isImRestConfigured(TRTC_SDK_APP_ID, TRTC_SECRET_KEY)

  /** 把评论代发进 IM 群（保留观众身份），返回 MsgSeq */
  async function relayCommentToIm(room, comment) {
    if (!imConfigured()) return { relayed: false, reason: 'im_not_configured' }
    const fromAccount = comment.senderUserId || `aud_${comment.id}`
    try {
      const r = await imSendGroupText({
        sdkAppId: TRTC_SDK_APP_ID,
        secretKey: TRTC_SECRET_KEY,
        groupId: imGroupIdForRoom(room),
        fromAccount,
        text: comment.text,
        cloudCustomData: { source: 'audience_comment', commentId: comment.id },
      })
      comment.imMsgSeq = r.MsgSeq ?? null
      comment.imRelayed = true
      comment.senderUserId = fromAccount
      return { relayed: true, msgSeq: r.MsgSeq }
    } catch (e) {
      comment.imError = e?.message || String(e)
      return { relayed: false, reason: comment.imError }
    }
  }

  function publicComment(c) {
    return {
      id: c.id,
      text: c.text,
      senderLabel: c.senderLabel,
      createdAt: c.createdAt,
      broadcasted: c.status === 'broadcasted',
    }
  }

  // —— OBS 拉流/推流端点 ——
  app.get('/api/rooms/:id/studio/obs-endpoints', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    res.json(obsEndpointsByRoom.get(room.id) || { active: false })
  })

  // —— 评论列表（播控台） ——
  app.get('/api/rooms/:id/studio/comments', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    ensureSeedComments(room)
    res.json({ items: getCommentList(room.id), imConfigured: imConfigured() })
  })

  // —— 公开评论流（观众端） ——
  app.get('/api/rooms/:id/comments/public', (req, res) => {
    const { room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }
    ensureSeedComments(room)
    const items = getCommentList(room.id)
      .filter((c) => !c.recalled)
      .map(publicComment)
    res.json({ items })
  })

  // —— 新增评论（观众发送 / 播控注入），真走 IM ——
  app.post('/api/rooms/:id/studio/comments', async (req, res) => {
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
    const senderUserId = String(req.body?.sender_user_id || req.body?.senderUserId || '').trim()
    const comment = makeComment({ text, senderLabel, senderUserId: senderUserId || null })
    const im = await relayCommentToIm(room, comment)
    const list = getCommentList(room.id)
    list.unshift(comment)
    while (list.length > STUDIO_COMMENTS_MAX) list.pop()
    res.status(201).json({ ...comment, im })
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
      if (comment.replyDraft.trim() && comment.status === 'pending') comment.status = 'ready'
    }
    res.json(comment)
  })

  // —— 认领 / 释放（多管理员协作锁） ——
  app.post('/api/rooms/:id/studio/comments/:commentId/claim', (req, res) => {
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
    const mod = String(req.body?.mod || '').trim().slice(0, 32) || 'unknown'
    const release = req.body?.release === true
    if (release) {
      if (comment.claimedBy === mod) {
        comment.claimedBy = null
        comment.claimedAt = null
      }
      res.json(comment)
      return
    }
    if (comment.claimedBy && comment.claimedBy !== mod) {
      res.status(409).json({ error: `该评论已被「${comment.claimedBy}」认领`, comment })
      return
    }
    comment.claimedBy = mod
    comment.claimedAt = new Date().toISOString()
    res.json(comment)
  })

  // —— 撤回评论（IM 撤回 + 本地标记） ——
  app.post('/api/rooms/:id/studio/comments/:commentId/recall', async (req, res) => {
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
    let imResult = { recalled: false, reason: 'no_msg_seq' }
    if (imConfigured() && comment.imMsgSeq != null) {
      try {
        await imRecallGroupMsg({
          sdkAppId: TRTC_SDK_APP_ID,
          secretKey: TRTC_SECRET_KEY,
          groupId: imGroupIdForRoom(room),
          msgSeq: comment.imMsgSeq,
        })
        imResult = { recalled: true }
      } catch (e) {
        imResult = { recalled: false, reason: e?.message || String(e) }
      }
    }
    comment.recalled = true
    comment.recalledAt = new Date().toISOString()
    comment.status = 'recalled'
    res.json({ ok: true, comment, im: imResult })
  })

  // —— 禁言评论发送者（IM 禁言） ——
  app.post('/api/rooms/:id/studio/comments/:commentId/mute', async (req, res) => {
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
    const seconds = Number(req.body?.seconds ?? DEFAULT_MUTE_SECONDS)
    const account = comment.senderUserId
    let imResult = { muted: false, reason: 'no_account' }
    if (!account) {
      imResult = { muted: false, reason: '该评论无关联 IM 账号（未走 IM）' }
    } else if (!imConfigured()) {
      imResult = { muted: false, reason: 'im_not_configured' }
    } else {
      try {
        await imForbidSendMsg({
          sdkAppId: TRTC_SDK_APP_ID,
          secretKey: TRTC_SECRET_KEY,
          groupId: imGroupIdForRoom(room),
          account,
          muteSeconds: seconds,
        })
        imResult = { muted: seconds > 0, seconds }
      } catch (e) {
        imResult = { muted: false, reason: e?.message || String(e) }
      }
    }
    comment.muted = imResult.muted === true
    res.json({ ok: true, comment, im: imResult })
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
    const mod = String(req.body?.mod || '').trim().slice(0, 32)
    if (mod) {
      if (comment.claimedBy && comment.claimedBy !== mod) {
        res.status(409).json({ error: `该评论已被「${comment.claimedBy}」认领`, comment })
        return
      }
      comment.claimedBy = mod
      comment.claimedAt = new Date().toISOString()
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
    if (!sessionMeta?.sessionId && isIvhConfigured()) {
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
      const job = jobId ? jobs.get(jobId) : null
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
      mode: meta?.mode || obsEndpointsByRoom.get(room.id)?.mode || null,
      ivhSessionId: meta?.sessionId || null,
      ivhVirtualmanUserId: meta?.ivhVirtualmanUserId || meta?.ivhUserId || null,
      playStreamAddr: meta?.playStreamAddr || null,
      job: job || null,
    })
  })

  app.post('/api/rooms/:id/studio/start', async (req, res) => {
    const { rooms, room } = findRoom(loadRooms, req.params.id)
    if (!room) {
      res.status(404).json({ error: '房间不存在' })
      return
    }

    // 默认生产模式：数智人产出可拉取地址，OBS 拉流转推；direct 为快速直连验证。
    const mode = req.body?.mode === 'direct' ? 'direct' : 'production'
    const ivhMode = mode === 'production' ? 'rtmp' : 'trtc'
    const welcomeText = String(req.body?.welcome_text || STUDIO_WELCOME_TEXT).trim()
    ensureSeedComments(room)

    const job = makeJob(room, {
      commentText: welcomeText,
      commentSource: mode === 'production' ? 'studio_start_obs' : 'studio_start_direct',
    })
    jobs.set(job.id, job)
    roomActiveJob.set(room.id, job.id)

    const anchorUserId = anchorOwnerAccount(room.liveId)

    // 计算 OBS 推流端点（把合成画面推回 TRTC 直播间）；缺少 TRTC 密钥时降级。
    let obs = { userId: anchorUserId, pushUrl: null, backupPushUrl: null }
    let obsSignError = null
    try {
      obs = buildObsPushEndpoint({
        sdkAppId: TRTC_SDK_APP_ID,
        liveId: room.liveId,
        userId: anchorUserId,
        genUserSig,
      })
    } catch (e) {
      obsSignError = e?.message || String(e)
    }

    // 房间登记在「创建房间」时已完成（管理后台同源），开播不再重复 create_room。
    const endpoints = {
      active: true,
      mode,
      anchorUserId,
      strRoomId: room.liveId,
      sdkAppId: Number(TRTC_SDK_APP_ID) || null,
      pushUrl: obs.pushUrl,
      backupPushUrl: obs.backupPushUrl,
      pushSignError: obsSignError,
      pullStreamAddr: null,
      pullStreamFlv: null,
      pullStreamHls: null,
    }

    try {
      if (!isIvhConfigured()) {
        job.status = 'image_done'
        job.ivhSessionKeptOpen = true
        job.updatedAt = new Date().toISOString()
        setRoomBroadcastStatus(rooms, room, 'live', saveRooms)
        obsEndpointsByRoom.set(room.id, endpoints)
        res.status(201).json({
          job,
          mode,
          ivhSessionId: null,
          placeholder: true,
          obs: endpoints,
        })
        return
      }

      const ensured = await ensureIvhSession(room, ivhDeps(), { mode: ivhMode })
      job.ivhSessionId = ensured.sessionId
      job.ivhVirtualmanUserId = ensured.ivhUserId
      job.ivhPlayStreamAddr = ensured.playStreamAddr
      if (welcomeText) {
        await broadcastText(ensured.sessionId, welcomeText)
        job.replyText = welcomeText.slice(0, 400)
      }
      job.status = 'image_done'
      job.ivhSessionKeptOpen = true
      job.updatedAt = new Date().toISOString()
      setRoomBroadcastStatus(rooms, room, 'live', saveRooms)

      if (ensured.playStreamAddr) {
        endpoints.pullStreamAddr = ensured.playStreamAddr
        endpoints.pullStreamFlv = toFlv(ensured.playStreamAddr)
        endpoints.pullStreamHls = toHls(ensured.playStreamAddr)
      }
      obsEndpointsByRoom.set(room.id, endpoints)

      res.status(201).json({
        job,
        mode,
        ivhSessionId: ensured.sessionId,
        ivhVirtualmanUserId: ensured.ivhVirtualmanUserId,
        reused: ensured.reused,
        obs: endpoints,
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
    obsEndpointsByRoom.delete(room.id)
    setRoomBroadcastStatus(rooms, room, 'idle', saveRooms)

    // 结束直播仅关闭数智人会话；直播间登记保留在管理后台，解散房间时才 destroy_room。
    res.json({ ok: true, ...result, job: job || null })
  })
}

/** rtmp://liveplay.ivh.qq.com/live/m789 → 同源 FLV/HLS 播放地址（供网页/播放器拉流预览） */
function toFlv(rtmp) {
  const m = String(rtmp).match(/^rtmps?:\/\/([^/]+)\/(.+)$/i)
  if (!m) return null
  return `https://${m[1]}/${m[2]}.flv`
}
function toHls(rtmp) {
  const m = String(rtmp).match(/^rtmps?:\/\/([^/]+)\/(.+)$/i)
  if (!m) return null
  return `https://${m[1]}/${m[2]}.m3u8`
}
