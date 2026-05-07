/**
 * 腾讯云 TUILiveKit · 直播间 SDK 调用示例
 * --------------------------------------------------
 * 这是一段“真实可跑”的代码示例，演示研发同学在 Web Vue3 工程中
 * 如何通过 AtomicXCore SDK（tuikit-atomicx-vue3）：
 *   - 主播侧：登录 + 开播 + 写自定义 metaData + 结束直播
 *   - 观众侧：登录 + 进房 + 取房间信息 / 元数据 + 离开
 *
 * 不渲染视频画面，仅用作研发对照实现的代码样例。
 *
 * 使用前提：
 *   - 已在腾讯云控制台开通 TUILiveKit 服务，拿到 SDKAppID。
 *   - 已通过服务端或本地 GenerateTestUserSig 工具生成对应 userId 的 userSig。
 *
 * ⚠️ 关键 API 入参形态（来自 SDK .d.ts，踩坑警示）：
 *   - login({ sdkAppId: number, userId: string, userSig: string })
 *       sdkAppId 必须是 number；userId/userSig 必须是 string。
 *   - startLive({ liveId: string, liveName: string, ... })
 *       liveId 必须是字符串；传 number 会在 C++ 层抛
 *       "Cannot pass non-string to std::string"。
 *   - joinLive({ liveId: string })
 *       入参是 { liveId } 对象。
 *   - fetchLiveInfo(liveId: string)
 *       注意：入参直接是字符串，不是 { liveId } 对象！
 *       传对象会让底层 getLiveInfo({ roomId: <obj> }) 把对象往 C++ 传，
 *       报 "Cannot pass non-string to std::string"。
 *   - queryMetaData({ keys: string[] })
 *       keys 必须是字符串数组。
 *   - updateLiveMetaData({ metaData: string })
 *       注意：metaData 是字符串（通常 JSON.stringify 后传入）。
 *
 * 文档参考：
 *   - 快速接入（Web）   https://www.tencentcloud.com/zh/document/product/1071/76729
 *   - LiveListStore     https://cloud.tencent.com/document/product/647/128564
 */

let _sdkPromise = null

/**
 * 懒加载 SDK，避免主包一开始就拉到 tuikit-atomicx-vue3。
 * 仅在真正调用直播相关逻辑时才动态 import。
 */
function loadSdk() {
  if (!_sdkPromise) {
    _sdkPromise = import('tuikit-atomicx-vue3')
  }
  return _sdkPromise
}

function assertString(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`参数 ${name} 必须为非空字符串，当前为 ${typeof value}: ${String(value)}`)
  }
}

function assertNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`参数 ${name} 必须为有限数值，当前为 ${typeof value}: ${String(value)}`)
  }
}

/**
 * 登录 TRTC。整个 SDK 的所有功能都需要先登录。
 *
 * @param {Object}   params
 * @param {number}   params.sdkAppId  控制台分配的 SDKAppID（number 类型）
 * @param {string}   params.userId    当前用户的唯一 ID
 * @param {string}   params.userSig   服务端 / 工具生成的鉴权票据
 */
export async function loginToTRTC({ sdkAppId, userId, userSig }) {
  assertNumber('sdkAppId', sdkAppId)
  assertString('userId', userId)
  assertString('userSig', userSig)

  const { useLoginState } = await loadSdk()
  const { login } = useLoginState()
  await login({ sdkAppId, userId, userSig })
}

/**
 * 主播开播（创建房间）。
 *
 * @param {Object}  params
 * @param {string}  params.liveId           房间 ID（字符串）
 * @param {string}  params.liveName         房间名
 * @param {string}  [params.notice]         公告
 * @param {string}  [params.coverUrl]       封面
 * @param {boolean} [params.isPublicVisible]
 * @param {boolean} [params.isLikeEnabled]
 * @param {boolean} [params.isGiftEnabled]
 */
export async function startLiveAsHost(params) {
  assertString('liveId', params?.liveId)
  assertString('liveName', params?.liveName)
  const { useLiveListState } = await loadSdk()
  const { startLive } = useLiveListState()
  await startLive(params)
}

/**
 * 主播结束直播（解散房间）。
 */
export async function endLive() {
  const { useLiveListState } = await loadSdk()
  const { endLive } = useLiveListState()
  await endLive()
}

/**
 * 观众进入指定直播间。
 *
 * @param {string} liveId 直播间 ID（与主播开播时使用的 liveId 一致）
 */
export async function joinLiveAsAudience(liveId) {
  assertString('liveId', liveId)
  const { useLiveListState } = await loadSdk()
  const { joinLive } = useLiveListState()
  await joinLive({ liveId })
}

/**
 * 拉取房间基础信息。
 *
 * ⚠️ SDK 签名是 fetchLiveInfo(liveId: string)，入参直接是字符串！
 *
 * @param {string} liveId 直播间 ID
 * @returns {Promise<Object>} 房间信息对象
 */
export async function fetchLiveInfo(liveId) {
  assertString('liveId', liveId)
  const { useLiveListState } = await loadSdk()
  const { fetchLiveInfo } = useLiveListState()
  return await fetchLiveInfo(liveId)
}

/**
 * 拉取直播列表。
 *
 * @param {Object} [params]
 * @param {string} [params.category]
 * @param {string} [params.cursor]
 * @param {number} [params.count]
 */
export async function fetchLiveList(params = {}) {
  const { useLiveListState } = await loadSdk()
  const { fetchLiveList, liveList } = useLiveListState()
  await fetchLiveList(params)
  return liveList.value
}

/**
 * 拉取房间自定义元数据（key-value）。
 *
 * @param {string[]} keys 想要查询的 key 列表
 * @returns {Promise<Record<string, string> | undefined>}
 */
export async function queryRoomMetaData(keys) {
  const { useLiveListState } = await loadSdk()
  const { queryMetaData } = useLiveListState()
  return await queryMetaData({ keys: keys ?? [] })
}

/**
 * 写入房间自定义元数据。
 *
 * ⚠️ Web SDK 这里 metaData 是字符串。如果要存对象，请自行 JSON.stringify。
 *
 * @param {string | Record<string, any>} metaData
 */
export async function updateRoomMetaData(metaData) {
  const { useLiveListState } = await loadSdk()
  const { updateLiveMetaData } = useLiveListState()
  const payload = typeof metaData === 'string' ? metaData : JSON.stringify(metaData)
  await updateLiveMetaData({ metaData: payload })
}

/**
 * 离开直播间。
 */
export async function leaveLive() {
  const { useLiveListState } = await loadSdk()
  const { leaveLive } = useLiveListState()
  await leaveLive()
}

/**
 * 一站式：登录 → 进房 → 拉房间信息（+ 可选元数据）。
 *
 * @param {Object}   params
 * @param {number}   params.sdkAppId
 * @param {string}   params.userId
 * @param {string}   params.userSig
 * @param {string}   params.liveId
 * @param {string[]} [params.metaKeys]  需要额外拉取的元数据 key 列表
 * @returns {Promise<{ liveInfo: Object, metaData: Record<string,string> | null }>}
 */
export async function enterLiveAndFetchInfo({
  sdkAppId,
  userId,
  userSig,
  liveId,
  metaKeys,
}) {
  await loginToTRTC({ sdkAppId, userId, userSig })
  await joinLiveAsAudience(liveId)

  const liveInfo = await fetchLiveInfo(liveId)

  let metaData = null
  if (Array.isArray(metaKeys) && metaKeys.length > 0) {
    metaData = await queryRoomMetaData(metaKeys)
  }

  return { liveInfo, metaData }
}

/**
 * 监听“直播被结束 / 观众被踢出”事件。
 * 返回一个解绑函数，建议在组件 onUnmounted 时调用。
 */
export async function subscribeLiveEvents(handlers = {}) {
  const { useLiveListState, LiveListEvent } = await loadSdk()
  const { subscribeEvent, unsubscribeEvent } = useLiveListState()

  const ended = handlers.onLiveEnded ?? (() => {})
  const kicked = handlers.onKickedOutOfLive ?? (() => {})

  subscribeEvent(LiveListEvent.onLiveEnded, ended)
  subscribeEvent(LiveListEvent.onKickedOutOfLive, kicked)

  return () => {
    unsubscribeEvent(LiveListEvent.onLiveEnded, ended)
    unsubscribeEvent(LiveListEvent.onKickedOutOfLive, kicked)
  }
}

/**
 * 调试用：生成纯字符串房间 ID。
 */
export function makeStringLiveId(prefix = 'debug_') {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 调试用：生成纯数字字符串房间 ID（看起来像数字，但仍是 string）。
 * 用来对照"liveId 必须是 string"——这种 ID 也能正常用。
 */
export function makeNumericLiveId() {
  return String(Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000))
}

/**
 * 调试用：生成几条随机字符串自定义信息（map 形态）。
 * 默认会同时返回 keys 和 metaData，方便接下来 queryMetaData 自检。
 */
export function makeRandomMetaData(count = 3) {
  const metaData = {}
  const keys = []
  for (let i = 0; i < count; i += 1) {
    const key = `debug_key_${i}_${Math.random().toString(36).slice(2, 6)}`
    metaData[key] = `val_${Math.random().toString(36).slice(2, 8)}`
    keys.push(key)
  }
  return { keys, metaData }
}
