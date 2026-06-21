/**
 * TUILiveKit 主播开播：仅 login + startLive / endLive（供直播管理后台可见）。
 * 画面预览请用独立 TRTC 观众身份（useTrtcStage），避免与 RoomEngine 内部 TRTC 冲突。
 */
import { onUnmounted, ref } from 'vue'
import { useLoginState, useLiveListState } from 'tuikit-atomicx-vue3'
import TUIRoomEngine from '@tencentcloud/tuiroom-engine-js'

export function useTuiLiveBroadcast() {
  const { login, logout } = useLoginState()
  const { startLive, endLive } = useLiveListState()

  const status = ref('idle')
  const errorMessage = ref('')

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
      await TUIRoomEngine.callExperimentalAPI(
        JSON.stringify({ api: 'enableUnlimitedRoom', params: { enable: true } }),
      )

      await startLive({
        liveId: cfg.liveId,
        liveName: cfg.liveName || cfg.liveId,
        isPublicVisible: true,
        isGiftEnabled: false,
        isLikeEnabled: false,
      })

      const roomEngine = TUIRoomEngine.getInstance()
      try {
        await roomEngine.closeLocalCamera()
      } catch {
        /* 数智人播控不推本地摄像头 */
      }

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
      try {
        await endLive()
      } catch {
        /* 可能已结束 */
      }
      await logout()
    } catch (e) {
      errorMessage.value = e?.message || String(e)
    } finally {
      status.value = 'idle'
    }
  }

  onUnmounted(() => {
    if (status.value === 'entered') leave()
  })

  return {
    status,
    errorMessage,
    enterAsAnchor,
    leave,
  }
}
