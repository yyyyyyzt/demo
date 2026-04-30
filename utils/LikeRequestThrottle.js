/**
 * 点赞同步防抖（不合并点赞次数）：
 * - 业务侧应在每次点击时立刻乐观 +1（或其它展示逻辑）；
 * - 任意次 tap() 只会在「停点 waitMs」后合并为 **一次** onCommit（不按点击次数累加 delta）；
 * - 模拟 latencyMs 后调用 onCommit()，由你在回调里请求接口并用 **服务端返回的总数** 覆盖展示。
 */
export class LikeRequestThrottle {
  /**
   * @param {object} options
   * @param {number} [options.waitMs=2000] 最后一次相关操作后等待多久再发请求
   * @param {number} [options.latencyMs=500] 模拟接口耗时
   * @param {() => void | Promise<void>} options.onCommit 成功回调（无参数；在此发请求并写入服务端总数）
   * @param {(err: unknown) => void} [options.onError]
   */
  constructor({ waitMs = 2000, latencyMs = 500, onCommit, onError } = {}) {
    this.waitMs = waitMs
    this.latencyMs = latencyMs
    this.onCommit = onCommit ?? (() => {})
    this.onError = onError ?? (() => {})

    /** 是否需要一次同步（任意次点击都会置 true） */
    this._dirty = false
    this._debounceTimer = 0
    this._latencyTimer = 0
    this._flushing = false
  }

  /** 防抖计时中（停点后才会发起请求） */
  get isDebouncing() {
    return this._debounceTimer !== 0
  }

  /** 正在模拟网络 / 执行 onCommit */
  get isSending() {
    return this._flushing
  }

  /** 是否还有「待同步」：防抖中，或请求中用户又点了（会再排一轮） */
  get hasPendingSync() {
    return this.isDebouncing || (this._dirty && this._flushing)
  }

  /**
   * 每次用户点赞调用一次（不累计 delta；多点仍只触发一次 onCommit，除非请求结束后又产生新的 dirty）
   */
  tap() {
    this._dirty = true
    if (this._flushing) {
      return
    }
    if (this._debounceTimer) {
      window.clearTimeout(this._debounceTimer)
    }
    this._debounceTimer = window.setTimeout(() => {
      this._debounceTimer = 0
      void this._runFlush()
    }, this.waitMs)
  }

  _scheduleDebounce() {
    if (this._debounceTimer) {
      window.clearTimeout(this._debounceTimer)
    }
    this._debounceTimer = window.setTimeout(() => {
      this._debounceTimer = 0
      void this._runFlush()
    }, this.waitMs)
  }

  async _runFlush() {
    if (this._flushing) return
    if (!this._dirty) return

    this._dirty = false
    this._flushing = true

    await new Promise((resolve) => {
      this._latencyTimer = window.setTimeout(resolve, this.latencyMs)
    })
    this._latencyTimer = 0

    try {
      await this.onCommit()
    } catch (err) {
      this.onError(err)
    } finally {
      this._flushing = false
      if (this._dirty) {
        this._scheduleDebounce()
      }
    }
  }

  dispose() {
    if (this._debounceTimer) window.clearTimeout(this._debounceTimer)
    if (this._latencyTimer) window.clearTimeout(this._latencyTimer)
    this._debounceTimer = 0
    this._latencyTimer = 0
    this._dirty = false
    this._flushing = false
  }
}
