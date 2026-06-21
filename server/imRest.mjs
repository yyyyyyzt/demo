/**
 * 腾讯云即时通信 IM REST —— 评论链路真走 IM：群发文本、撤回群消息、群成员禁言/解禁。
 * 以 App 管理员身份调用；可选 From_Account 代发以保留观众身份。
 * 文档：
 *  - 在群组中发送系统/普通消息 https://cloud.tencent.com/document/product/269/1629
 *  - 撤回群消息 group_msg_recall https://cloud.tencent.com/document/product/269/12341
 *  - 批量禁言/解禁 forbid_send_msg https://cloud.tencent.com/document/product/269/1627
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Api: TLSSigApi } = require('tls-sig-api-v2')

const DEFAULT_DOMAIN = 'https://console.tim.qq.com'

export function getImRestAdminUserId() {
  return String(
    process.env.IM_REST_ADMIN_USER_ID || process.env.TUILIVE_REST_ADMIN_USER_ID || '',
  ).trim()
}

export function isImRestConfigured(sdkAppId, secretKey) {
  return Boolean(sdkAppId && secretKey && getImRestAdminUserId())
}

async function imPost(command, body, { sdkAppId, secretKey, adminUserId }) {
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
  const url = `${domain}/v4/${command}?${qs.toString()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  let json = {}
  try {
    json = JSON.parse(await res.text())
  } catch {
    /* noop */
  }
  if (!res.ok) {
    const err = new Error(`IM REST HTTP ${res.status}`)
    err.statusCode = 502
    throw err
  }
  if (json.ErrorCode !== 0 && json.ErrorCode != null) {
    const err = new Error(json.ErrorInfo || `IM ErrorCode=${json.ErrorCode}`)
    err.statusCode = 502
    err.imCode = json.ErrorCode
    throw err
  }
  return json
}

/**
 * 在群内以某用户身份发送文本，返回 MsgSeq（用于后续撤回）。
 * @param {{ sdkAppId:string|number, secretKey:string, adminUserId?:string, groupId:string, fromAccount:string, text:string, cloudCustomData?:Record<string,unknown> }} p
 * @returns {Promise<{ MsgSeq:number, MsgTime:number }>}
 */
export async function imSendGroupText(p) {
  const adminUserId = p.adminUserId || getImRestAdminUserId()
  const random = Math.floor(Math.random() * 4294967295)
  const body = {
    GroupId: String(p.groupId),
    Random: random,
    From_Account: String(p.fromAccount),
    MsgBody: [{ MsgType: 'TIMTextElem', MsgContent: { Text: String(p.text) } }],
  }
  if (p.cloudCustomData && Object.keys(p.cloudCustomData).length > 0) {
    body.CloudCustomData = JSON.stringify(p.cloudCustomData)
  }
  const json = await imPost('group_open_http_svc/send_group_msg', body, {
    sdkAppId: p.sdkAppId,
    secretKey: p.secretKey,
    adminUserId,
  })
  return { MsgSeq: json.MsgSeq, MsgTime: json.MsgTime }
}

/**
 * 撤回群消息（按 MsgSeq）。
 * @param {{ sdkAppId:string|number, secretKey:string, adminUserId?:string, groupId:string, msgSeq:number }} p
 */
export async function imRecallGroupMsg(p) {
  const adminUserId = p.adminUserId || getImRestAdminUserId()
  return imPost(
    'group_open_http_svc/group_msg_recall',
    { GroupId: String(p.groupId), MsgSeqList: [{ MsgSeq: Number(p.msgSeq) }] },
    { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
  )
}

/**
 * 群成员禁言 / 解禁。muteSeconds=0 解禁；4294967295 表示永久禁言。
 * @param {{ sdkAppId:string|number, secretKey:string, adminUserId?:string, groupId:string, account:string, muteSeconds:number }} p
 */
export async function imForbidSendMsg(p) {
  const adminUserId = p.adminUserId || getImRestAdminUserId()
  return imPost(
    'group_open_http_svc/forbid_send_msg',
    {
      GroupId: String(p.groupId),
      Members_Account: [String(p.account)],
      MuteTime: Math.max(0, Math.floor(Number(p.muteSeconds) || 0)),
    },
    { sdkAppId: p.sdkAppId, secretKey: p.secretKey, adminUserId },
  )
}
