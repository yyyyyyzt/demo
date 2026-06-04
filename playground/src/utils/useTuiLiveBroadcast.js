/**
 * TUILiveKit 主播开播：login + startLive，供腾讯云「直播管理系统」识别为正式直播。
 * 预览仍通过同一 TUIRoomEngine 的 TRTC 实例订阅房间内远端（含数智人）。
 */
import { onUnmounted, ref } from 'vue'
import { useLoginState, useLiveListState } from 'tuikit-atomicx-vue3'
import TUIRoomEngine from '@tencentcloud/tuiroom-engine-js'
import TRTC from 'trtc-sdk-v5'

export function useTuiLiveBroadcast() {
  const { login, logout } = useLoginState()
  const { startLive, endLive } = useLiveListState()

  const stageRef = ref(null)
  const status = ref('idle')
  const errorMessage = ref('')
  const hasRemoteVideo = ref(false)
  const remoteUsers = ref([])

  let trtcCloud = null
  let handlers = null

  function attachRemoteVideo(userId, streamType) {
    if (!stageRef.value || !trtcCloud) return
    trtcCloud
      .startRemoteVideo({ userId, streamType, view: stageRef.value })
      .then(() => {
        hasRemoteVideo.value = true
      })
      .catch((err) => {
        errorMessage.value = `订阅远端视频失败：${err?.message || err}`
      })
  }

  function bindTrtcEvents() {
    if (!trtcCloud || handlers) return
    const onEnter = (ev) => {
      if (ev?.userId && !remoteUsers.value.includes(ev.userId)) {
        remoteUsers.value = [...remoteUsers.value, ev.userId]
      }
    }
    const onExit = (ev) => {
      if (!ev?.userId) return
      remoteUsers.value = remoteUsers.value.filter((id) => id !== ev.userId)
      if (!remoteUsers.value.length) hasRemoteVideo.value = false
    }
    const onVideo = (ev) => {
      if (ev?.userId) attachRemoteVideo(ev.userId, ev.streamType || TRTC.TYPE.STREAM_TYPE_MAIN)
    }
    const onVideoOff = () => {
      if (!remoteUsers.value.length) hasRemoteVideo.value = false
    }
    const onError = (err) => {
      errorMessage.value = `TRTC 错误：${err?.message || err}`
    }
    handlers = { onEnter, onExit, onVideo, onVideoOff, onError }
    trtcCloud.on(TRTC.EVENT.REMOTE_USER_ENTER, onEnter)
    trtcCloud.on(TRTC.EVENT.REMOTE_USER_EXIT, onExit)
    trtcCloud.on(TRTC.EVENT.REMOTE_VIDEO_AVAILABLE, onVideo)
    trtcCloud.on(TRTC.EVENT.REMOTE_VIDEO_UNAVAILABLE, onVideoOff)
    trtcCloud.on(TRTC.EVENT.ERROR, onError)
  }

  function unbindTrtcEvents() {
    if (!trtcCloud || !handlers) return
    trtcCloud.off(TRTC.EVENT.REMOTE_USER_ENTER, handlers.onEnter)
    trtcCloud.off(TRTC.EVENT.REMOTE_USER_EXIT, handlers.onExit)
    trtcCloud.off(TRTC.EVENT.REMOTE_VIDEO_AVAILABLE, handlers.onVideo)
    trtcCloud.off(TRTC.EVENT.REMOTE_VIDEO_UNAVAILABLE, handlers.onVideoOff)
    trtcCloud.off(TRTC.EVENT.ERROR, handlers.onError)
    handlers = null
  }

  /**
   * @param {{ sdkAppId: number, userId: string, userSig: string, liveId: string, liveName?: string }} cfg
   */
  async function enterAsAnchor(cfg) {
    if (status.value === 'entered' || status.value === 'entering') return
    errorMessage.value = ''
    status.value = 'entering'
    try {
      await login({
        sdkAppId: Number(cfg.sdkAppId),
        userId: cfg.userId,
        userSig: cfg.userSig,
      })

      await TUIRoomEngine.callExperimentalAPI(
        JSON.stringify({ api: 'setFramework', params: { component: 'LiveCoreView', language: 'vue3' } }),
      )

      await startLive({
        liveId: cfg.liveId,
        liveName: cfg.liveName || cfg.liveId,
        isPublicVisible: true,
        isSeatEnabled: true,
        seatLayoutTemplateId: 200,
        isGiftEnabled: false,
        isLikeEnabled: false,
      })

      const roomEngine = TUIRoomEngine.getInstance()
      trtcCloud = roomEngine.getTRTCCloud()
      try {
        await roomEngine.closeLocalCamera()
      } catch {
        /* 数智人播控不推本地摄像头 */
      }

      bindTrtcEvents()
      status.value = 'entered'
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e?.message || String(e)
      await leave().catch(() => {})
      throw e
    }
  }

  async function leave() {
    if (status.value === 'idle' || status.value === 'leaving') return
    status.value = 'leaving'
    try {
      unbindTrtcEvents()
      try {
        await endLive()
      } catch {
        /* 可能已结束 */
      }
      await logout()
    } catch (e) {
      errorMessage.value = e?.message || String(e)
    } finally {
      trtcCloud = null
      remoteUsers.value = []
      hasRemoteVideo.value = false
      status.value = 'idle'
    }
  }

  onUnmounted(() => {
    if (status.value === 'entered') leave()
  })

  return {
    stageRef,
    status,
    errorMessage,
    hasRemoteVideo,
    remoteUsers,
    enterAsAnchor,
    leave,
  }
}
