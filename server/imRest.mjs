/**
 * 腾讯云 IM REST — 在群内发文本（App 管理员身份调接口，可选 From_Account 代发展示）
 * 文档：https://cloud.tencent.com/document/product/269/1629
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Api: TLSSigApi } = require('tls-sig-api-v2')

const DEFAULT_DOMAIN = 'https://console.tim.qq.com'

/**
 * @param {{
 *   sdkAppId: string|number,
 *   secretKey: string,
 *   adminUserId: string,
 *   groupId: string,
 *   fromAccount: string,
 *   text: string,
 *   cloudCustomData?: Record<string, unknown>,
 * }} p
 */
export async function imSendGroupTextAsUser(p) {
  const domain = (process.env.IM_REST_API_DOMAIN || DEFAULT_DOMAIN).replace(/\/$/, '')
  const api = new TLSSigApi(Number(p.sdkAppId), p.secretKey)
  const userSig = api.genSig(String(p.adminUserId), 180)
  const random = Math.floor(Math.random() * 4294967295)
  const qs = new URLSearchParams({
    sdkappid: String(p.sdkAppId),
    identifier: String(p.adminUserId),
    usersig: userSig,
    random: String(random),
    contenttype: 'json',
  })
  const url = `${domain}/v4/group_open_http_svc/send_group_msg?${qs.toString()}`
  const body = {
    GroupId: String(p.groupId),
    Random: random,
    From_Account: String(p.fromAccount),
    MsgBody: [{ MsgType: 'TIMTextElem', MsgContent: { Text: String(p.text) } }],
  }
  if (p.cloudCustomData && Object.keys(p.cloudCustomData).length > 0) {
    body.CloudCustomData = JSON.stringify(p.cloudCustomData)
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  if (json.ErrorCode !== 0) {
    const err = new Error(json.ErrorInfo || `IM ErrorCode=${json.ErrorCode}`)
    err.statusCode = 502
    err.imCode = json.ErrorCode
    throw err
  }
  return json
}
