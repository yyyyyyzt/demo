import {
  isIvhConfigured,
  ivhCloseSession,
  ivhCreateTrtcSession,
  ivhSendText,
  ivhStartSession,
  ivhStatSession,
  ivhWaitUntilReady,
  ivhWaitUntilSessionStarted,
} from './ivhApaas.mjs'

/** 每个业务房间当前保持打开的数智人会话 */
const lastOpenIvhSessionByRoomInternalId = new Map()
/** roomId -> { sessionId, ivhUserId, ivhVirtualmanUserId } */
const sessionMetaByRoom = new Map()

export function getRoomIvhSessionMeta(roomInternalId) {
  const sessionId = lastOpenIvhSessionByRoomInternalId.get(roomInternalId)
  if (!sessionId) return null
  const meta = sessionMetaByRoom.get(roomInternalId) || {}
  return { sessionId, ...meta }
}

/** 主动结束某房间当前的数智人会话 */
export async function closeRoomIvhSession(roomInternalId) {
  const sessionId = lastOpenIvhSessionByRoomInternalId.get(roomInternalId)
  if (!sessionId) return { closed: false, reason: 'no_active_session' }
  lastOpenIvhSessionByRoomInternalId.delete(roomInternalId)
  sessionMetaByRoom.delete(roomInternalId)
  try {
    await ivhCloseSession(sessionId)
    return { closed: true, sessionId }
  } catch (e) {
    return { closed: false, sessionId, reason: e?.message || String(e) }
  }
}

const IVH_AUTO_CLOSE_SESSION = process.env.IVH_AUTO_CLOSE_SESSION === '1'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sanitizeComment(text) {
  return String(text)
    .replace(/\0/g, '')
    .trim()
    .slice(0, 2000)
}

async function isSessionStillActive(sessionId) {
  try {
    const json = await ivhStatSession(sessionId)
    const st = json.Payload?.SessionStatus
    return st === 1 || st === 3
  } catch {
    return false
  }
}

/**
 * 纯播报：固定 NotUseChat，由业务侧 LLM 生成文案。
 */
export async function broadcastText(sessionId, text) {
  const safe = sanitizeComment(text)
  if (!safe) throw Object.assign(new Error('播报文本为空'), { statusCode: 400 })
  await ivhSendText(sessionId, safe, { useChat: false })
  return safe
}

/**
 * 若房间已有有效会话则复用；否则 createsession → startsession。
 * @returns {{ sessionId: string, ivhUserId: string, reused: boolean, playStreamAddr?: string }}
 */
export async function ensureIvhSession(room, deps, options = {}) {
  if (!isIvhConfigured()) {
    const err = new Error('未配置 IVH_* 环境变量')
    err.statusCode = 503
    throw err
  }

  const existingId = lastOpenIvhSessionByRoomInternalId.get(room.id)
  if (existingId && (await isSessionStillActive(existingId))) {
    const meta = sessionMetaByRoom.get(room.id) || {}
    return {
      sessionId: existingId,
      ivhUserId: meta.ivhUserId,
      ivhVirtualmanUserId: meta.ivhVirtualmanUserId || meta.ivhUserId,
      reused: true,
      playStreamAddr: meta.playStreamAddr || null,
    }
  }
  if (existingId) {
    lastOpenIvhSessionByRoomInternalId.delete(room.id)
    sessionMetaByRoom.delete(room.id)
  }

  const projectId = process.env.IVH_VIRTUALMAN_PROJECT_ID
  const suffix = options.sessionSuffix || `st_${Date.now().toString(36)}`
  const baseUid =
    String(process.env.IVH_TRTC_USER_ID || '').trim() ||
    `vh_${String(room.liveId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24)}`
  const ivhUserId = `${baseUid}_${suffix}`.slice(0, 48)
  const trtcUserSig = deps.genUserSig(ivhUserId)

  const createJson = await ivhCreateTrtcSession({
    virtualmanProjectId: projectId,
    ivhUserId,
    trtcAppId: deps.trtcSdkAppId,
    trtcStrRoomId: room.liveId,
    trtcUserSig,
    privateMapKey: process.env.IVH_TRTC_PRIVATE_MAP_KEY || 'dummy',
  })

  const pl0 = createJson.Payload || {}
  const sessionId = pl0.SessionId || pl0.SessionID
  if (!sessionId) throw new Error('创建会话未返回 SessionId')

  await ivhWaitUntilReady(sessionId)

  const stat1 = await ivhStatSession(sessionId)
  const p1 = stat1.Payload || {}
  let playStreamAddr = p1.PlayStreamAddr || null

  if (!p1.IsSessionStarted) {
    await ivhStartSession(sessionId)
    await ivhWaitUntilSessionStarted(sessionId)
  }

  const stat2 = await ivhStatSession(sessionId)
  const p2 = stat2.Payload || {}
  if (p2.PlayStreamAddr) playStreamAddr = p2.PlayStreamAddr

  lastOpenIvhSessionByRoomInternalId.set(room.id, sessionId)
  sessionMetaByRoom.set(room.id, {
    ivhUserId,
    ivhVirtualmanUserId: ivhUserId,
    playStreamAddr,
  })

  return {
    sessionId,
    ivhUserId,
    ivhVirtualmanUserId: ivhUserId,
    reused: false,
    playStreamAddr,
  }
}

async function runPlaceholderPipeline(job) {
  job.status = 'llm_done'
  job.replyText = `【演示占位】服务端未检测到 IVH_*，未调用腾讯云数智人网关。将用于驱动的原文：${String(job.commentText).slice(0, 160)}`
  job.updatedAt = new Date().toISOString()
  await sleep(500)
  job.status = 'image_done'
  job.imageUrl = 'https://picsum.photos/seed/dhjob/960/540'
  job.updatedAt = new Date().toISOString()
}

/**
 * 异步执行数字人 pipeline。交付 Demo 默认不关旧会话（长驻流）。
 * @param {{ closePreviousSession?: boolean, keepSessionOpen?: boolean }} [pipelineOptions]
 */
export async function runDigitalHumanPipeline(job, room, deps, pipelineOptions = {}) {
  const closePrevious = pipelineOptions.closePreviousSession === true
  const keepOpen = pipelineOptions.keepSessionOpen !== false

  const safeText = sanitizeComment(job.commentText)
  job.commentText = safeText
  job.replyText = safeText.slice(0, 400)
  job.status = 'llm_done'
  job.updatedAt = new Date().toISOString()

  if (!isIvhConfigured()) {
    await runPlaceholderPipeline(job)
    return
  }

  if (closePrevious) {
    const prevSessionId = lastOpenIvhSessionByRoomInternalId.get(room.id)
    if (prevSessionId) {
      try {
        await ivhCloseSession(prevSessionId)
      } catch {
        /* noop */
      }
      lastOpenIvhSessionByRoomInternalId.delete(room.id)
      sessionMetaByRoom.delete(room.id)
    }
  }

  let sessionId = null
  try {
    const ensured = await ensureIvhSession(room, deps, {
      sessionSuffix: job.id?.slice(-8) || 'job',
    })
    sessionId = ensured.sessionId
    job.ivhSessionId = sessionId
    job.ivhVirtualmanUserId = ensured.ivhUserId
    job.ivhPlayStreamAddr = ensured.playStreamAddr
    job.updatedAt = new Date().toISOString()

    await broadcastText(sessionId, safeText)

    if (IVH_AUTO_CLOSE_SESSION && !keepOpen) {
      await sleep(1200)
      await ivhCloseSession(sessionId)
      job.ivhClosed = true
      lastOpenIvhSessionByRoomInternalId.delete(room.id)
      sessionMetaByRoom.delete(room.id)
    } else {
      job.ivhSessionKeptOpen = true
    }

    job.status = 'image_done'
    job.imageUrl = null
    job.updatedAt = new Date().toISOString()
  } catch (e) {
    job.status = 'failed'
    job.ivhError = e?.message || String(e)
    job.updatedAt = new Date().toISOString()
    if (sessionId && closePrevious) {
      try {
        await ivhCloseSession(sessionId)
      } catch {
        /* noop */
      }
      lastOpenIvhSessionByRoomInternalId.delete(room.id)
      sessionMetaByRoom.delete(room.id)
    }
  }
}
