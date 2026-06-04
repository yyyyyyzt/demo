/**
 * 原生 TRTC v5 远端订阅最小封装：进同一字符串房间号（与数智人 aPaaS `TrtcStrRoomId` 对齐），
 * 收到任意远端用户的视频流就渲染到 stage 容器；不调用 TUILiveKit 的 startLive/joinLive，
 * 因此与「谁是 anchor」无关，能直接看到数智人的画面（根因：LiveView 仅渲染 anchor 流）。
 */
import { onUnmounted, ref, shallowRef } from 'vue'
import TRTC from 'trtc-sdk-v5'

export function useTrtcStage() {
  const stageRef = ref(null)
  /** @type {import('vue').ShallowRef<any>} */
  const client = shallowRef(null)
  const status = ref('idle') // idle | entering | entered | leaving | error
  const errorMessage = ref('')
  const remoteUsers = ref(/** @type {string[]} */ ([]))
  const hasRemoteVideo = ref(false)

  function attachRemoteVideo(userId, streamType) {
    if (!stageRef.value || !client.value) return
    client.value
      .startRemoteVideo({ userId, streamType, view: stageRef.value })
      .then(() => {
        hasRemoteVideo.value = true
      })
      .catch((err) => {
        errorMessage.value = `订阅远端视频失败：${err?.message || err}`
      })
  }

  function onRemoteUserEnter(ev) {
    if (ev?.userId && !remoteUsers.value.includes(ev.userId)) {
      remoteUsers.value = [...remoteUsers.value, ev.userId]
    }
  }
  function onRemoteUserExit(ev) {
    if (!ev?.userId) return
    remoteUsers.value = remoteUsers.value.filter((id) => id !== ev.userId)
    if (remoteUsers.value.length === 0) hasRemoteVideo.value = false
  }
  function onRemoteVideoAvailable(ev) {
    if (!ev?.userId) return
    attachRemoteVideo(ev.userId, ev.streamType || TRTC.TYPE.STREAM_TYPE_MAIN)
  }
  function onRemoteVideoUnavailable() {
    if (remoteUsers.value.length === 0) hasRemoteVideo.value = false
  }

  /**
   * @param {{ sdkAppId: number, userId: string, userSig: string, strRoomId: string, role?: 'anchor' | 'audience' }} cfg
   */
  async function enterRoom(cfg) {
    if (status.value === 'entered' || status.value === 'entering') return
    errorMessage.value = ''
    status.value = 'entering'
    try {
      const trtc = TRTC.create()
      client.value = trtc
      trtc.on(TRTC.EVENT.REMOTE_USER_ENTER, onRemoteUserEnter)
      trtc.on(TRTC.EVENT.REMOTE_USER_EXIT, onRemoteUserExit)
      trtc.on(TRTC.EVENT.REMOTE_VIDEO_AVAILABLE, onRemoteVideoAvailable)
      trtc.on(TRTC.EVENT.REMOTE_VIDEO_UNAVAILABLE, onRemoteVideoUnavailable)
      trtc.on(TRTC.EVENT.ERROR, (err) => {
        errorMessage.value = `TRTC 错误：${err?.message || err}`
      })
      await trtc.enterRoom({
        sdkAppId: cfg.sdkAppId,
        userId: cfg.userId,
        userSig: cfg.userSig,
        strRoomId: cfg.strRoomId,
        scene: TRTC.TYPE.SCENE_LIVE,
        role: cfg.role === 'anchor' ? TRTC.TYPE.ROLE_ANCHOR : TRTC.TYPE.ROLE_AUDIENCE,
        autoReceiveAudio: true,
        autoReceiveVideo: false,
      })
      status.value = 'entered'
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e?.message || String(e)
      try {
        await client.value?.exitRoom()
      } catch {
        /* noop */
      }
      client.value = null
    }
  }

  /** 数智人进房后若错过事件，可主动按 userId 订阅 */
  function subscribeRemoteUser(userId, streamType) {
    if (!userId) return
    attachRemoteVideo(userId, streamType || TRTC.TYPE.STREAM_TYPE_MAIN)
  }

  async function exitRoom() {
    if (!client.value) {
      status.value = 'idle'
      return
    }
    status.value = 'leaving'
    try {
      await client.value.exitRoom()
    } catch (e) {
      errorMessage.value = e?.message || String(e)
    }
    try {
      client.value.destroy?.()
    } catch {
      /* noop */
    }
    client.value = null
    remoteUsers.value = []
    hasRemoteVideo.value = false
    status.value = 'idle'
  }

  onUnmounted(() => {
    if (client.value) exitRoom()
  })

  return {
    stageRef,
    status,
    errorMessage,
    remoteUsers,
    hasRemoteVideo,
    enterRoom,
    exitRoom,
    subscribeRemoteUser,
  }
}
