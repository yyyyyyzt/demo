/**
 * 评论回复文案生成：未配置 LLM 时使用占位模板；可插拔 OpenAI 兼容 API。
 */

const LLM_PROVIDER = String(process.env.LLM_PROVIDER || '').trim()
const LLM_API_KEY = String(process.env.LLM_API_KEY || '').trim()
const LLM_BASE_URL = String(process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const LLM_MODEL = String(process.env.LLM_MODEL || 'gpt-4o-mini').trim()
const LLM_SYSTEM_PROMPT =
  process.env.LLM_SYSTEM_PROMPT ||
  '你是直播间主持人助理。根据观众评论写一句简短、友好、可口语播报的中文回复（80字以内），不要 markdown。'

function summarizeComment(text, maxLen = 40) {
  const t = String(text).replace(/\s+/g, ' ').trim()
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`
}

export function isLlmConfigured() {
  return LLM_PROVIDER === 'openai_compatible' && Boolean(LLM_API_KEY)
}

function placeholderReply(commentText) {
  const summary = summarizeComment(commentText)
  return `感谢您的留言。关于「${summary}」，我们的回答是：我们会尽快为您核实并回复，也欢迎您继续关注本场直播。`
}

async function openAiCompatibleReply(commentText) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: LLM_SYSTEM_PROMPT },
        { role: 'user', content: `观众评论：${commentText}` },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || `LLM HTTP ${res.status}`
    throw Object.assign(new Error(msg), { statusCode: 502 })
  }
  const content = data?.choices?.[0]?.message?.content
  if (!content?.trim()) {
    throw Object.assign(new Error('LLM 返回空内容'), { statusCode: 502 })
  }
  return String(content).trim().slice(0, 2000)
}

/**
 * @param {{ commentText: string, senderLabel?: string }} input
 * @returns {Promise<{ replyDraft: string, source: 'placeholder' | 'llm' }>}
 */
export async function generateReplyDraft(input) {
  const commentText = String(input.commentText || '').trim()
  if (!commentText) {
    throw Object.assign(new Error('评论内容为空'), { statusCode: 400 })
  }

  if (isLlmConfigured()) {
    try {
      const replyDraft = await openAiCompatibleReply(commentText)
      return { replyDraft, source: 'llm' }
    } catch (e) {
      if (process.env.LLM_FALLBACK_PLACEHOLDER !== '0') {
        return {
          replyDraft: placeholderReply(commentText),
          source: 'placeholder',
          llmError: e.message,
        }
      }
      throw e
    }
  }

  return { replyDraft: placeholderReply(commentText), source: 'placeholder' }
}
