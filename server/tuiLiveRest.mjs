/**
 * TUILiveKit 服务端 REST — 在直播管理后台创建/解散直播间
 * 文档：https://cloud.tencent.com/document/product/1071/76885
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Api: TLSSigApi } = require('tls-sig-api-v2')

const DEFAULT_DOMAIN = 'https://console.tim.qq.com'

export function getTuiLiveRestAdminUserId() {
  return String(process.env.TUILIVE_REST_ADMIN_USER_ID || process.env.IM_REST_ADMIN_USER_ID || '').trim()
}

export function isTuiLiveRestConfigured(sdkAppId, secretKey) {
  return Boolean(sdkAppId && secretKey && getTuiLiveRestAdminUserId())
}

async function liveEnginePost(command, body, { sdkAppId, secretKey, adminUserId }) {
  const domain = (process.env.IM_REST_API_DOMAIN || DEFAULT_DOMAIN).replace(/\/$/, '')
  const api = new TLSSigApi(Number(sdkAppId), secretKey)
  const userSig = api.genSig(String(adminUserId), 180)
  const random = Math.floor(Math.random() * 4294967295)
  const qs = new URLSearchParams({
    sdkappid: String(sdkAppId),
    identifier: String(adminUserId),
    usersig: userSig,
    random: String(random),
    contenttype: 'json',
  })
  const url = `${domain}/v4/live_engine_http_srv/${command}?${qs.toString()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let json = {}
  try {
    json = JSON.parse(text)
  } catch {
    /* noop */
  }
  if (!res.ok) {
    const err = new Error(`TUILive REST HTTP ${res.status}: ${text.slice(0, 200)}`)
    err.statusCode = 502
    throw err
  }
  if (json.ErrorCode !== 0 && json.ErrorCode != null) {
    let msg = json.ErrorInfo || `TUILive ErrorCode=${json.ErrorCode}`
    if (/admin account/i.test(msg)) {
      msg =
        'REST 请求的 identifier 必须是该 SDKAppID 的 App 管理员账号（控制台 → 应用配置 → 账号管理）。请检查 TUILIVE_REST_ADMIN_USER_ID'
    }
    const err = new Error(msg)
    err.statusCode = 502
    err.tuiLiveCode = json.ErrorCode
    throw err
  }
  return json
}

/**
 * @param {{ sdkAppId: string|number, secretKey: string, adminUserId?: string, liveId: string, title: string, ownerAccount: string }} p
 */
export async function createTuiLiveRoom(p) {
  const adminUserId = p.adminUserId || getTuiLiveRestAdminUserId()
  if (!adminUserId) {
    const err = new Error('未配置 TUILIVE_REST_ADMIN_USER_ID 或 IM_REST_ADMIN_USER_ID')
    err.statusCode = 503
    throw err
  }
  return liveEnginePost(
    'create_room',
    {
      RoomInfo: {
        RoomId: String(p.liveId),
        RoomType: 'Live',
        RoomName: String(p.title || p.liveId).slice(0, 100),
        Owner_Account: String(p.ownerAccount),
        IsPublicVisible: true,
        IsSeatEnabled: false,
      },
    },
    { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
  )
}

/**
 * 拉取 TUILiveKit 直播间列表（管理后台同源数据），分页。
 * 文档：https://cloud.tencent.com/document/product/1071/76888
 * @param {{ sdkAppId: string|number, secretKey: string, adminUserId?: string, next?: string, count?: number }} p
 * @returns {Promise<{ rooms: Array<object>, next: string }>}
 */
export async function listTuiLiveRooms(p) {
  const adminUserId = p.adminUserId || getTuiLiveRestAdminUserId()
  if (!adminUserId) {
    const err = new Error('未配置 TUILIVE_REST_ADMIN_USER_ID 或 IM_REST_ADMIN_USER_ID')
    err.statusCode = 503
    throw err
  }
  const json = await liveEnginePost(
    'get_room_list',
    { Next: String(p.next || ''), Count: Math.min(Math.max(Number(p.count) || 20, 1), 20) },
    { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
  )
  const resp = json.Response || {}
  return { rooms: resp.RoomList || [], next: resp.Next || '' }
}

/**
 * @param {{ sdkAppId: string|number, secretKey: string, adminUserId?: string, liveId: string }} p
 */
export async function destroyTuiLiveRoom(p) {
  const adminUserId = p.adminUserId || getTuiLiveRestAdminUserId()
  if (!adminUserId) {
    const err = new Error('未配置 TUILIVE_REST_ADMIN_USER_ID 或 IM_REST_ADMIN_USER_ID')
    err.statusCode = 503
    throw err
  }
  return liveEnginePost(
    'destroy_room',
    { RoomId: String(p.liveId) },
    { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
  )
}
