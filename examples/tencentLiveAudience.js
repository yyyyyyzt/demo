/**
 * 腾讯云 TUILiveKit · 观众进入直播间示例
 * --------------------------------------------------
 * 这是一段“真实可跑”的代码示例，演示研发同学在 Web Vue3 工程中
 * 如何通过 AtomicXCore SDK（tuikit-atomicx-vue3）以观众身份进入
 * 一个已开播的腾讯直播间，并取到该房间的基础信息和元数据。
 *
 * 本示例不渲染视频画面，只调用 API：
 *   1. login           —— 登录 TRTC（前置条件）
 *   2. joinLive        —— 观众身份进入指定 liveId 直播间
 *   3. fetchLiveInfo   —— 拉取房间基础信息（房名、公告、主播、观看数、封面…）
 *   4. queryMetaData   —— 拉取房间自定义元数据
 *   5. leaveLive       —— 离开直播间
 *
 * 使用前提：
 *   - 已在腾讯云控制台开通 TUILiveKit 服务，拿到 SDKAppID。
 *   - 已通过服务端或本地 GenerateTestUserSig 工具生成对应 userId 的 userSig。
 *
 * 文档参考：
 *   - 快速接入（Web）   https://www.tencentcloud.com/zh/document/product/1071/76729
 *   - LiveListStore     https://cloud.tencent.com/document/product/647/128564
 */

let _sdkPromise = null

/**
 * 懒加载 SDK，避免主包一开始就拉到 tuikit-atomicx-vue3。
 * 仅在真正调用观众进房逻辑时才动态 import。
 */
function loadSdk() {
  if (!_sdkPromise) {
    _sdkPromise = import('tuikit-atomicx-vue3')
  }
  return _sdkPromise
}

/**
 * 登录 TRTC。整个 SDK 的所有功能都需要先登录。
 *
 * @param {Object}   params
 * @param {number}   params.sdkAppId  控制台分配的 SDKAppID
 * @param {string}   params.userId    当前观众的唯一用户 ID
 * @param {string}   params.userSig   服务端 / 工具生成的鉴权票据
 */
export async function loginToTRTC({ sdkAppId, userId, userSig }) {
  if (!sdkAppId) throw new Error('缺少 sdkAppId')
  if (!userId) throw new Error('缺少 userId')
  if (!userSig) throw new Error('缺少 userSig')

  const { useLoginState } = await loadSdk()
  const { login } = useLoginState()
  await login({ sdkAppId, userId, userSig })
}

/**
 * 观众进入指定直播间。
 *
 * @param {string} liveId 直播间 ID（与主播开播时使用的 liveId 一致）
 */
export async function joinLiveAsAudience(liveId) {
  if (!liveId) throw new Error('缺少 liveId')
  const { useLiveListState } = await loadSdk()
  const { joinLive } = useLiveListState()
  await joinLive({ liveId })
}

/**
 * 拉取房间基础信息。返回的字段示例：
 *   {
 *     liveId, liveName, notice, coverUrl, backgroundUrl,
 *     liveOwner: { userId, name, avatarUrl },
 *     totalViewerCount, createTime,
 *     isMessageDisable, isPublicVisible, isSeatEnabled,
 *     maxSeatCount, seatMode, seatLayoutTemplateId,
 *     categoryList, activityStatus, isGiftEnabled,
 *     metaData: { ... }
 *   }
 *
 * @param {string} liveId 直播间 ID
 * @returns {Promise<Object>} 房间信息对象
 */
export async function fetchLiveInfo(liveId) {
  if (!liveId) throw new Error('缺少 liveId')
  const { useLiveListState } = await loadSdk()
  const { fetchLiveInfo } = useLiveListState()
  return await fetchLiveInfo({ liveId })
}

/**
 * 拉取房间自定义元数据（key-value）。
 *
 * 业务侧通常用这套 KV 存放“当前在播的商品 ID”“活动倒计时”
 * “红包雨开关”这类自定义状态。
 *
 * @param {string[]} keys 想要查询的 key 列表
 * @returns {Promise<Record<string, string>>}
 */
export async function queryRoomMetaData(keys) {
  const { useLiveListState } = await loadSdk()
  const { queryMetaData } = useLiveListState()
  return await queryMetaData({ keys: keys ?? [] })
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
 * 这个函数适合放在“点赞按钮所在直播间页面”首次挂载时调用，
 * 拿到房间信息后再渲染头部、主播信息、点赞数初值等。
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
 *
 * @param {Object}   handlers
 * @param {Function} [handlers.onLiveEnded]
 * @param {Function} [handlers.onKickedOutOfLive]
 * @returns {Promise<() => void>}
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
