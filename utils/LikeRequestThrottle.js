/**
 * 点赞同步防抖（不合并点赞次数）：
 * - tap() 返回 true 时，业务侧立刻乐观 +1；
 * - 防抖窗口内任意次 tap() 都只算 **一次** 点赞，不累计 delta；
 * - 可选等待 latencyMs 后调用 onCommit()，由你在回调里请求接口并用 **服务端返回的总数** 覆盖展示。
 */
export class LikeRequestThrottle {
  /**
   * @param {object} options
   * @param {number} [options.waitMs=2000] 最后一次相关操作后等待多久再发请求
   * @param {number} [options.latencyMs=0] 模拟接口耗时；真实接口场景通常不需要设置
   * @param {() => void | Promise<void>} options.onCommit 成功回调（无参数；在此发请求并写入服务端总数）
   * @param {(err: unknown) => void} [options.onError]
   */
  constructor({ waitMs = 2000, latencyMs = 0, onCommit, onError } = {}) {
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

  /** 是否还有「待同步」：防抖中，或请求中 */
  get hasPendingSync() {
    return this.isDebouncing || this.isSending
  }

  /**
   * 每次用户点赞调用一次。
   * @returns {boolean} true 表示这是本轮第一次点击，业务侧应乐观 +1；false 表示已在本轮防抖/请求中。
   */
  tap() {
    if (this._flushing) {
      return false
    }

    const shouldOptimisticLike = !this._dirty
    this._dirty = true
    if (this._debounceTimer) {
      window.clearTimeout(this._debounceTimer)
    }
    this._debounceTimer = window.setTimeout(() => {
      this._debounceTimer = 0
      void this._runFlush()
    }, this.waitMs)

    return shouldOptimisticLike
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
