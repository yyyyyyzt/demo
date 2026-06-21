/**
 * 腾讯云智能数智人 aPaaS — 云渲染 HTTP 调用（创建会话 / 查询 / 开启 / 文本驱动 / 关闭）
 * 鉴权与签名：https://cloud.tencent.com/document/product/1240/107197
 */
import crypto from 'node:crypto'

const DEFAULT_BASE = 'https://gw.tvs.qq.com'

function reqId32() {
  return crypto.randomUUID().replace(/-/g, '')
}

function buildSignedUrl(path) {
  const appkey = process.env.IVH_APP_KEY
  const accessToken = process.env.IVH_ACCESS_TOKEN
  if (!appkey || !accessToken) {
    const err = new Error('缺少 IVH_APP_KEY 或 IVH_ACCESS_TOKEN')
    err.statusCode = 503
    throw err
  }
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params = { appkey, timestamp }
  const keys = Object.keys(params).sort()
  const signingContent = keys.map((k) => `${k}=${params[k]}`).join('&')
  const hmac = crypto.createHmac('sha256', accessToken)
  hmac.update(signingContent)
  const hashInBase64 = hmac.digest('base64')
  const signature = encodeURIComponent(hashInBase64)
  const base = (process.env.IVH_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  return `${base}${path}?${signingContent}&signature=${signature}`
}

async function ivhPost(path, payload) {
  const url = buildSignedUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ Header: {}, Payload: payload }),
  })
  const raw = await res.text()
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    const err = new Error(`IVH 响应非 JSON（HTTP ${res.status}）：${raw.slice(0, 400)}`)
    err.statusCode = 502
    throw err
  }
  const code = json.Header?.Code
  if (code !== 0 && code != null) {
    const err = new Error(json.Header?.Message || `IVH Header.Code=${code}`)
    err.ivhHeader = json.Header
    err.statusCode = 502
    throw err
  }
  return json
}

export function isIvhConfigured() {
  return Boolean(
    process.env.IVH_APP_KEY && process.env.IVH_ACCESS_TOKEN && process.env.IVH_VIRTUALMAN_PROJECT_ID,
  )
}

/** 供 /api/health 与前端展示：不返回任何密钥，仅列出缺失的环境变量名 */
export function getIvhEnvDiagnostics() {
  const required = ['IVH_APP_KEY', 'IVH_ACCESS_TOKEN', 'IVH_VIRTUALMAN_PROJECT_ID']
  const missingEnvKeys = required.filter((k) => !String(process.env[k] || '').trim())
  return {
    configured: missingEnvKeys.length === 0,
    missingEnvKeys,
  }
}

export async function ivhCreateTrtcSession({
  virtualmanProjectId,
  ivhUserId,
  trtcAppId,
  trtcStrRoomId,
  trtcUserSig,
  privateMapKey = 'dummy',
}) {
  const payload = {
    ReqId: reqId32(),
    VirtualmanProjectId: virtualmanProjectId,
    UserId: ivhUserId,
    Protocol: 'trtc',
    DriverType: 1,
    ProtocolOption: {
      TrtcUseExternalApp: true,
      TrtcAppId: String(trtcAppId),
      TrtcStrRoomId: String(trtcStrRoomId),
      TrtcUserSig: String(trtcUserSig),
      TrtcPrivateMapKey: privateMapKey,
    },
  }
  return ivhPost('/v2/ivh/sessionmanager/sessionmanagerservice/createsession', payload)
}

/**
 * 创建 rtmp 协议会话：数智人渲染后产出一路可拉取的播放地址（PlayStreamAddr），
 * 供专业 OBS 等工具「拉流 → 抠像/装修 → 转推」到直播间。数智人本身不进 TRTC 房间。
 * 若传入 cssCustomPushUrl，则数智人直接推到该自定义云直播地址，接口不再返回 PlayStreamAddr。
 * @param {{ virtualmanProjectId: string, ivhUserId: string, cssCustomPushUrl?: string }} p
 */
export async function ivhCreateRtmpSession({ virtualmanProjectId, ivhUserId, cssCustomPushUrl }) {
  const payload = {
    ReqId: reqId32(),
    VirtualmanProjectId: virtualmanProjectId,
    UserId: ivhUserId,
    Protocol: 'rtmp',
    DriverType: 1,
  }
  if (cssCustomPushUrl) {
    payload.ProtocolOption = { CssCustomPushUrl: String(cssCustomPushUrl) }
  }
  return ivhPost('/v2/ivh/sessionmanager/sessionmanagerservice/createsession', payload)
}

export async function ivhStatSession(sessionId) {
  return ivhPost('/v2/ivh/sessionmanager/sessionmanagerservice/statsession', {
    ReqId: reqId32(),
    SessionId: sessionId,
  })
}

export async function ivhStartSession(sessionId) {
  return ivhPost('/v2/ivh/sessionmanager/sessionmanagerservice/startsession', {
    ReqId: reqId32(),
    SessionId: sessionId,
  })
}

/**
 * @param {{ useChat?: boolean }} [options] — 与官方 H5 demo 一致：`useChat=true` 时 `ChatCommand` 为空走对话；否则 `NotUseChat` 纯文本驱动（TTS）
 */
export async function ivhSendText(sessionId, text, options = {}) {
  const data = {
    Text: String(text).slice(0, 4000),
  }
  if (options.useChat === true) {
    data.ChatCommand = ''
  } else {
    data.ChatCommand = 'NotUseChat'
  }
  return ivhPost('/v2/ivh/interactdriver/interactdriverservice/command', {
    ReqId: reqId32(),
    SessionId: sessionId,
    Command: 'SEND_TEXT',
    Data: data,
  })
}

export async function ivhCloseSession(sessionId) {
  return ivhPost('/v2/ivh/sessionmanager/sessionmanagerservice/closesession', {
    ReqId: reqId32(),
    SessionId: sessionId,
  })
}

/**
 * 查询当前账号（uin）下所有进行中的数智人会话。
 * 用于异常中断后清理遗留会话、释放并发（不依赖本地内存映射）。
 * 文档：https://cloud.tencent.com/document/product/1240/100393
 * @returns {Promise<Array<{ UserId:string, SessionId:string, SessionStatus:number, PlayStreamAddr?:string, DriverType?:number, IsSessionStarted?:boolean }>>}
 */
export async function ivhListSessionsOfUin() {
  const json = await ivhPost('/v2/ivh/sessionmanager/sessionmanagerservice/listsessionofuin', {
    ReqId: reqId32(),
  })
  return json.Payload?.Sessions || []
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 轮询直到会话就绪（SessionStatus===1）或失败（4）/关闭（2）
 */
export async function ivhWaitUntilReady(sessionId, options = {}) {
  const maxAttempts = options.maxAttempts ?? 90
  const intervalMs = options.intervalMs ?? 2000
  let lastPayload = null
  for (let i = 0; i < maxAttempts; i += 1) {
    const json = await ivhStatSession(sessionId)
    const p = json.Payload || {}
    lastPayload = p
    const st = p.SessionStatus
    if (st === 4) {
      const err = new Error(p.ErrorMessage || '创建会话失败（SessionStatus=4）')
      err.statusCode = 502
      throw err
    }
    if (st === 2) {
      const err = new Error('会话已关闭（SessionStatus=2）')
      err.statusCode = 502
      throw err
    }
    if (st === 1) return { payload: p, raw: json }
    await sleep(intervalMs)
  }
  const err = new Error('等待数智人会话就绪超时')
  err.lastPayload = lastPayload
  err.statusCode = 504
  throw err
}

export async function ivhWaitUntilSessionStarted(sessionId, options = {}) {
  const maxAttempts = options.maxAttempts ?? 45
  const intervalMs = options.intervalMs ?? 2000
  for (let i = 0; i < maxAttempts; i += 1) {
    const json = await ivhStatSession(sessionId)
    const p = json.Payload || {}
    if (p.IsSessionStarted) return { payload: p, raw: json }
    await sleep(intervalMs)
  }
  const err = new Error('等待开启会话（IsSessionStarted）超时')
  err.statusCode = 504
  throw err
}
