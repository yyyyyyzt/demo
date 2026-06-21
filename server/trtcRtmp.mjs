/**
 * 生成「OBS 拉流转推」所需的地址：
 *  - 推流地址（OBS 输出）：把合成后的画面以 RTMP 推回 TRTC 直播间（机器人/主播身份）。
 *    文档：实时音视频 · 输入媒体流进房 https://cloud.tencent.com/document/product/647/102957
 *    格式：rtmp://rtmp.rtc.qq.com/push/{strRoomId}?sdkappid=&userid=&usersig=
 *    主域名 rtmp.rtc.qq.com，备用域名 rtmp.cloud-rtc.com（主域名解析异常时使用）。
 *    需在 TRTC 控制台「功能配置 → 输入媒体流进房」开启。strRoomId 仅支持数字/字母/下划线，≤64。
 *
 * 注意：观看端必须用「相同的字符串房间号」进房才能看到该路 RTMP 流，
 * 本项目所有进房都用 strRoomId = liveId，已满足该约束。
 */

const PRIMARY_DOMAIN = 'rtmp.rtc.qq.com'
const BACKUP_DOMAIN = 'rtmp.cloud-rtc.com'

/** OBS 推流端固定使用的机器人/主播 userId（与房间 liveId 绑定，全局唯一；≤32 以符合 IM UserID 限制） */
export function obsRobotUserId(liveId) {
  const safe = String(liveId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 22)
  return `obs_robot_${safe}`.slice(0, 32)
}

function buildPushUrl(domain, { sdkAppId, liveId, userId, userSig }) {
  const qs = new URLSearchParams({
    sdkappid: String(sdkAppId),
    userid: String(userId),
    usersig: String(userSig),
  })
  return `rtmp://${domain}/push/${encodeURIComponent(String(liveId))}?${qs.toString()}`
}

/**
 * 计算 OBS 输出（推回 TRTC 直播间）的 RTMP 推流地址。
 * @param {{ sdkAppId: string|number, liveId: string, userId: string, genUserSig: (uid:string, expire?:number)=>string, expireSec?: number }} p
 * @returns {{ userId: string, pushUrl: string, backupPushUrl: string, expireSec: number, domain: string, backupDomain: string }}
 */
export function buildObsPushEndpoint({ sdkAppId, liveId, userId, genUserSig, expireSec = 86400 }) {
  const uid = userId || obsRobotUserId(liveId)
  const userSig = genUserSig(uid, expireSec)
  return {
    userId: uid,
    pushUrl: buildPushUrl(PRIMARY_DOMAIN, { sdkAppId, liveId, userId: uid, userSig }),
    backupPushUrl: buildPushUrl(BACKUP_DOMAIN, { sdkAppId, liveId, userId: uid, userSig }),
    expireSec,
    domain: PRIMARY_DOMAIN,
    backupDomain: BACKUP_DOMAIN,
  }
}
