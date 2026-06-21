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

async function restPost(service, command, body, { sdkAppId, secretKey, adminUserId }) {
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
  const url = `${domain}/v4/${service}/${command}?${qs.toString()}`
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

function liveEnginePost(command, body, ctx) {
  return restPost('live_engine_http_srv', command, body, ctx)
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
  // 新版 create_room：SeatTemplate 必填；部分应用版本还要求 IsUnlimitedRoomEnabled。
  // 文档：https://cloud.tencent.com/document/product/647/110036
  const seatTemplate = process.env.TUILIVE_SEAT_TEMPLATE || 'VideoDynamicGrid9Seats'
  try {
    return await liveEnginePost(
      'create_room',
      {
        RoomInfo: {
          RoomId: String(p.liveId),
          RoomType: 'Live',
          RoomName: String(p.title || p.liveId).slice(0, 100),
          Owner_Account: String(p.ownerAccount),
          SeatTemplate: seatTemplate,
          TakeSeatMode: 'ApplyToTake',
          IsPublicVisible: true,
          IsUnlimitedRoomEnabled: true,
        },
      },
      { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
    )
  } catch (e) {
    // 100010：房间已存在且 Owner 相同，可直接复用，视为成功
    if (e.tuiLiveCode === 100010) return { ErrorCode: 0, reused: true }
    throw e
  }
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

/**
 * 在直播间内添加机器人（机器人账号需为已导入账号）。
 * 文档：https://cloud.tencent.com/document/product/647/117783
 * @param {{ sdkAppId:string|number, secretKey:string, adminUserId?:string, liveId:string, robotId:string }} p
 */
export async function addTuiLiveRobot(p) {
  const adminUserId = p.adminUserId || getTuiLiveRestAdminUserId()
  try {
    return await liveEnginePost(
      'add_robot',
      { RoomId: String(p.liveId), RobotList_Account: [String(p.robotId)] },
      { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
    )
  } catch (e) {
    // 机器人已在房间内视为成功
    if (/exist|already/i.test(e.message || '')) return { ErrorCode: 0, reused: true }
    throw e
  }
}

/**
 * 让机器人/成员上麦（观众端默认只拉麦上主播流，机器人 RTMP 推流需上麦才可被看到）。
 * 文档：https://cloud.tencent.com/document/product/647/60718
 * @param {{ sdkAppId:string|number, secretKey:string, adminUserId?:string, liveId:string, account:string, index?:number }} p
 */
export async function pickRobotOnSeat(p) {
  const adminUserId = p.adminUserId || getTuiLiveRestAdminUserId()
  const index = Number.isFinite(Number(p.index)) ? Number(p.index) : 0
  try {
    return await restPost(
      'room_engine_http_mic',
      'pick_user_on_seat',
      { RoomId: String(p.liveId), Member_Account: String(p.account), Index: index },
      { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
    )
  } catch (e) {
    // 已在麦位上视为成功
    if (/already|on seat|seated/i.test(e.message || '')) return { ErrorCode: 0, reused: true }
    throw e
  }
}

/**
 * 让机器人/成员下麦。
 * 文档：https://cloud.tencent.com/document/product/647/60719
 * @param {{ sdkAppId:string|number, secretKey:string, adminUserId?:string, liveId:string, account:string }} p
 */
export async function kickRobotOffSeat(p) {
  const adminUserId = p.adminUserId || getTuiLiveRestAdminUserId()
  return restPost(
    'room_engine_http_mic',
    'kick_user_off_seat',
    { RoomId: String(p.liveId), Member_Account: String(p.account) },
    { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
  )
}
