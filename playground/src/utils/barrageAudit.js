/** 弹幕 extensionInfo / CloudCustomData 中的审核标记（与 IM REST 下发字段一致） */
export const AUDIT_PENDING = 'pending'
export const AUDIT_PUBLIC = 'public'

export function normalizeExtensionInfo(raw) {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw)
      return typeof o === 'object' && o ? o : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function getAuditState(msg) {
  const ext = normalizeExtensionInfo(msg?.extensionInfo)
  const v = ext.audit ?? ext.Audit
  return typeof v === 'string' ? v : ''
}

export function isPendingBarrage(msg) {
  return getAuditState(msg) === AUDIT_PENDING
}

export function isPublicBarrage(msg) {
  return getAuditState(msg) === AUDIT_PUBLIC
}

export function barrageDedupeKey(msg) {
  return `${msg?.sequence ?? ''}-${msg?.timestampInSecond ?? ''}-${msg?.sender?.userId ?? ''}`
}
