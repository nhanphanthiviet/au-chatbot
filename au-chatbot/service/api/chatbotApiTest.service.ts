import type { APIRequestContext } from '@playwright/test'
import { API_ENDPOINTS } from '../../constants/api-endpoints'
import { UrlWrapper } from '../../core/common'
import type { ApiResult } from '../../core/common/errors'
import { ApiErrorHandler } from './ApiErrorHandler'

export interface ChatbotApiTestConfig {
  baseUrl: string
  threadId: string
}

export interface ChatbotApiTestResponse {
  status: number
  elapsedMs: number
  rawBody: unknown
  responseText: string
  url: string
}

/** Convenience alias — the concrete result type returned by ChatbotApiTestService. */
export type ChatbotApiResult = ApiResult<ChatbotApiTestResponse>

export interface SendMessageOptions {
  retries?: number
}

export function loadChatbotApiTestConfig(): ChatbotApiTestConfig {
  return {
    baseUrl: UrlWrapper.normalizeBaseUrl(process.env.CHATBOT_API_BASE_URL || 'https://bythanh.com'),
    threadId: process.env.CHATBOT_THREAD_ID || 'thread_jmqiybbUB2hNIxVlW1LylgOD',
  }
}

export class ChatbotApiTestService {
  constructor(private readonly config: ChatbotApiTestConfig) {}

  /**
   * Sends a chat message and returns a discriminated-union result.
   *
   * On infrastructure failure (timeout, network, parse) the caller receives
   * `{ success: false, error }` so test specs can triage infra vs AI issues
   * without try/catch. Retries are handled here when options.retries > 0.
   */
  async sendMessage(
    request: APIRequestContext,
    content: string,
    options: SendMessageOptions = {},
  ): Promise<ChatbotApiResult> {
    const url = `${this.config.baseUrl}${API_ENDPOINTS.chatbotThreadMessages(this.config.threadId)}`

    const attempts = Math.max(0, options.retries ?? 0) + 1
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const startedAt = Date.now()
      try {
        const response = await request.post(url, {
          headers: {
            'content-type': 'text/plain;charset=UTF-8',
            accept: '*/*',
          },
          data: JSON.stringify({ content }),
        })
        const elapsedMs = Date.now() - startedAt
        const responseText = await response.text()

        // Best-effort JSON parse — non-JSON responses are valid for this API.
        let rawBody: unknown = responseText
        if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
          try {
            rawBody = JSON.parse(responseText)
          } catch {
            // Keep raw text; don't treat a parse hiccup as an infra failure.
          }
        }

        return {
          success: true,
          data: { status: response.status(), elapsedMs, rawBody, responseText, url },
        }
      } catch (error) {
        const normalizedError = ApiErrorHandler.normalizeTransportError(error, url)
        if (attempt === attempts) {
          return { success: false, error: normalizedError }
        }
      }
    }

    return {
      success: false,
      error: { type: 'unknown', message: 'Unexpected execution path in sendMessage', url },
    }
  }
}
