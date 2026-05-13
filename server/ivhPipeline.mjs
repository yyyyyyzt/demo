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

/** 每个业务房间（rooms.json 的 id）当前未主动 closesession 的数智人会话，用于新任务前释放上一路推流 */
const lastOpenIvhSessionByRoomInternalId = new Map()

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
 * 异步执行：数智人云渲染 TRTC 进房 + HTTP 一句话文本驱动；失败则标记 failed。
 * @param {object} job — 已存入 jobs Map 的可变对象
 * @param {object} room — { id, liveId, ... }
 * @param {{ genUserSig: (userId: string, expire?: number) => string, trtcSdkAppId: string }} deps
 */
export async function runDigitalHumanPipeline(job, room, deps) {
  const safeText = sanitizeComment(job.commentText)
  job.commentText = safeText
  job.replyText = safeText.slice(0, 400)
  job.status = 'llm_done'
  job.updatedAt = new Date().toISOString()

  if (!isIvhConfigured()) {
    await runPlaceholderPipeline(job)
    return
  }

  const prevSessionId = lastOpenIvhSessionByRoomInternalId.get(room.id)
  if (prevSessionId) {
    try {
      await ivhCloseSession(prevSessionId)
    } catch {
      /* noop */
    }
    lastOpenIvhSessionByRoomInternalId.delete(room.id)
  }

  let sessionId = null
  try {
    const projectId = process.env.IVH_VIRTUALMAN_PROJECT_ID
    const baseUid =
      String(process.env.IVH_TRTC_USER_ID || '').trim() ||
      `vh_${String(room.liveId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24)}`
    const ivhUserId = `${baseUid}_${job.id.slice(-8)}`.slice(0, 48)
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
    sessionId = pl0.SessionId || pl0.SessionID
    if (!sessionId) throw new Error('创建会话未返回 SessionId')
    job.ivhSessionId = sessionId
    job.ivhVirtualmanUserId = ivhUserId
    job.updatedAt = new Date().toISOString()

    await ivhWaitUntilReady(sessionId)

    const stat1 = await ivhStatSession(sessionId)
    const p1 = stat1.Payload || {}
    job.ivhPlayStreamAddr = p1.PlayStreamAddr || job.ivhPlayStreamAddr || null
    job.updatedAt = new Date().toISOString()

    if (!p1.IsSessionStarted) {
      await ivhStartSession(sessionId)
      await ivhWaitUntilSessionStarted(sessionId)
    }

    const stat2 = await ivhStatSession(sessionId)
    const p2 = stat2.Payload || {}
    if (p2.PlayStreamAddr) job.ivhPlayStreamAddr = p2.PlayStreamAddr

    await ivhSendText(sessionId, safeText)

    // 默认不 closesession：否则数智人立即退房，观众端几乎看不到画面（日志里 peer-leave 即此）。
    // 新任务开始时会先关闭本房间上一会话。联调/省并发可设 IVH_AUTO_CLOSE_SESSION=1。
    if (IVH_AUTO_CLOSE_SESSION) {
      await sleep(1200)
      await ivhCloseSession(sessionId)
      job.ivhClosed = true
      lastOpenIvhSessionByRoomInternalId.delete(room.id)
    } else {
      job.ivhSessionKeptOpen = true
      lastOpenIvhSessionByRoomInternalId.set(room.id, sessionId)
    }

    job.status = 'image_done'
    job.imageUrl = null
    job.updatedAt = new Date().toISOString()
  } catch (e) {
    job.status = 'failed'
    job.ivhError = e?.message || String(e)
    job.updatedAt = new Date().toISOString()
    if (sessionId) {
      try {
        await ivhCloseSession(sessionId)
      } catch {
        /* noop */
      }
    }
    lastOpenIvhSessionByRoomInternalId.delete(room.id)
  }
}
