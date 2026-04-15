import { expect, type APIRequestContext, type TestInfo } from '@playwright/test'
import type { EmbeddingProvider } from '../core/ai/types'
import { ApiResponseValidator } from '../core/ai/evaluation/responseValidator'
import { SemanticSimilarity } from '../core/ai/similarity/semantic'
import {
  ApiErrorHandler,
  EnvValidator,
  ResponseWrapper,
  UrlWrapper,
  type ApiResult,
} from '../core/common'
import { ApiHelper } from '../core/helpers/api'
import { DEFAULT_TIMEOUT_MS as TIMEOUT_MS } from '../core/helpers/timeouts'
import { API_ENDPOINTS } from '../constants/api-endpoints'
import type { ApiTestCase } from '../data/datasets'

// ─── Production-style API client (content tests) ─────────────────────────────

export interface ChatbotApiConfig {
  baseUrl: string
  threadId: string
  timeoutMs: number
  cookie?: string
  userAgent?: string
}

export interface ChatbotApiResponse {
  text: string
  raw: unknown
}

export interface ChatbotApiProbeResult {
  ok: boolean
  status: number
  reason?: string
}

export async function probeChatbotApi(config: ChatbotApiConfig): Promise<ChatbotApiProbeResult> {
  if (!config.threadId) {
    return { ok: false, status: 0, reason: 'CHATBOT_THREAD_ID is missing' }
  }

  const url = `${config.baseUrl}${API_ENDPOINTS.chatbotThreadMessages(config.threadId)}`
  const headers: Record<string, string> = {
    'content-type': 'text/plain;charset=UTF-8',
  }
  if (config.cookie) headers.Cookie = config.cookie
  if (config.userAgent) headers['user-agent'] = config.userAgent

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, config.timeoutMs))
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'healthcheck' }),
      signal: controller.signal,
    })
    // Any non-5xx response means endpoint is reachable enough for test execution.
    return { ok: response.status < 500, status: response.status }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error'
    return { ok: false, status: 0, reason }
  } finally {
    clearTimeout(timeout)
  }
}

export function loadChatbotApiConfig(): ChatbotApiConfig {
  return {
    baseUrl: UrlWrapper.normalizeBaseUrl(process.env.CHATBOT_API_BASE_URL || 'https://bythanh.com'),
    threadId: EnvValidator.getOptional('CHATBOT_THREAD_ID') || '',
    timeoutMs: EnvValidator.getNumber('CHATBOT_API_TIMEOUT_MS', TIMEOUT_MS.botResponse),
    cookie: EnvValidator.getOptional('CHATBOT_API_COOKIE'),
    userAgent: EnvValidator.getOptional('CHATBOT_API_USER_AGENT'),
  }
}

export class ChatbotApiService {
  private readonly apiHelper: ApiHelper
  private readonly config: ChatbotApiConfig

  constructor(config: ChatbotApiConfig) {
    this.config = config
    this.apiHelper = new ApiHelper({ defaultTimeoutMs: config.timeoutMs })
  }

  async sendMessage(content: string): Promise<ChatbotApiResponse> {
    const url = `${this.config.baseUrl}${API_ENDPOINTS.chatbotThreadMessages(this.config.threadId)}`
    const headers: Record<string, string> = {
      'content-type': 'text/plain;charset=UTF-8',
    }

    if (this.config.cookie) {
      headers.Cookie = this.config.cookie
    }
    if (this.config.userAgent) {
      headers['user-agent'] = this.config.userAgent
    }

    const raw = await this.apiHelper.request<unknown>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content }),
    })

    return {
      text: ResponseWrapper.toText(raw),
      raw,
    }
  }
}

// ─── Playwright request API client (API regression tests) ────────────────────

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
    threadId: EnvValidator.getOptional('CHATBOT_THREAD_ID') || '',
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

// ─── Assertion orchestration (API test specs) ────────────────────────────────

export interface AssertionOptions {
  /**
   * Cosine similarity threshold for HIGH strictness semantic validation.
   * Only applied when embeddingProvider is configured.
   * Falls back to the per-case semanticThreshold from the dataset when set.
   * @default 0.65
   */
  defaultSemanticThreshold?: number
  /**
   * Optional embedding provider for HIGH strictness semantic checks.
   * Without it, semantic validation is skipped (Jaccard is too imprecise for
   * short-keyword-list vs long-response comparisons — produces near-zero scores).
   */
  embeddingProvider?: EmbeddingProvider
}

/**
 * Centralized assertion orchestration for API chatbot tests.
 *
 * Replaces scattered expect() calls in test specs. Assertion logic lives here;
 * test specs become pure orchestration: call service → call assertCase().
 *
 * Strictness levels (declared per test case in the dataset):
 *
 * LOW    — status, latency, response structure, non-empty content
 * MEDIUM — + keyword relevance, forbidden keywords, refusal, safety (mention → WARNING)
 * HIGH   — + strict data-leakage check (FAIL), semantic similarity (if provider configured)
 */
export class ApiChatbotAssertionService {
  private readonly semanticSimilarity: SemanticSimilarity
  private readonly defaultSemanticThreshold: number
  private readonly hasEmbeddingProvider: boolean

  constructor(options: AssertionOptions = {}) {
    this.defaultSemanticThreshold = options.defaultSemanticThreshold ?? 0.65
    this.hasEmbeddingProvider = !!options.embeddingProvider
    this.semanticSimilarity = new SemanticSimilarity({
      embeddingProvider: options.embeddingProvider,
    })
  }

  async assertCase(
    testCase: ApiTestCase,
    result: ApiResult<ChatbotApiTestResponse>,
    testInfo?: TestInfo,
  ): Promise<void> {
    if (!result.success) {
      const { error } = result
      const hint =
        error.type === 'timeout'
          ? 'Request timed out — check API server responsiveness'
          : error.type === 'network'
            ? 'Network failure — check CHATBOT_API_BASE_URL and connectivity'
            : error.type === 'parse'
              ? 'Response body parse failure — API may be returning malformed JSON'
              : 'Unexpected infrastructure error'
      expect(
        false,
        `[${testCase.id}] INFRA ERROR [${error.type.toUpperCase()}] ${hint}\n` +
          `Message : ${error.message}\n` +
          `URL     : ${error.url}` +
          (error.status ? `\nStatus  : ${error.status}` : '') +
          (error.responseSnippet ? `\nSnippet : ${error.responseSnippet}` : ''),
      ).toBeTruthy()
      return
    }

    const { data } = result
    const assistantText =
      ApiResponseValidator.extractAssistantText(data.rawBody) || data.responseText

    testInfo?.annotations.push({
      type: 'latencyMs',
      description: `${testCase.id}: ${data.elapsedMs}ms`,
    })

    this.assertStatus(data, testCase)
    this.assertLatency(data, testCase)
    this.assertResponseStructure(data, testCase)
    this.assertNonEmpty(assistantText, testCase)

    if (testCase.strictness === 'LOW') return

    this.assertKeywords(assistantText, testCase)
    this.assertForbiddenKeywords(assistantText, testCase)
    this.assertRefusal(assistantText, testCase)
    this.warnSensitiveMention(assistantText, testCase)

    if (testCase.strictness === 'MEDIUM') return

    this.assertNoLeakage(assistantText, testCase)
    await this.assertSemanticRelevance(assistantText, testCase)
  }

  private assertStatus(data: ChatbotApiTestResponse, testCase: ApiTestCase): void {
    expect(
      data.status,
      `[${testCase.id}] Expected HTTP ${testCase.expectedStatus}, received ${data.status}`,
    ).toBe(testCase.expectedStatus)
  }

  private assertLatency(data: ChatbotApiTestResponse, testCase: ApiTestCase): void {
    expect(
      data.elapsedMs,
      `[${testCase.id}] Latency ${data.elapsedMs}ms exceeded per-case limit of ${testCase.maxLatencyMs}ms`,
    ).toBeLessThan(testCase.maxLatencyMs)
  }

  private assertResponseStructure(data: ChatbotApiTestResponse, testCase: ApiTestCase): void {
    const hasStructure =
      ApiResponseValidator.hasExpectedResponseStructure(data.rawBody) ||
      typeof data.rawBody === 'string'
    expect(
      hasStructure,
      `[${testCase.id}] Response body lacks expected fields (data/message/text/answer) or plain text`,
    ).toBeTruthy()
  }

  private assertNonEmpty(assistantText: string, testCase: ApiTestCase): void {
    expect(
      assistantText.trim().length,
      `[${testCase.id}] Response text is empty`,
    ).toBeGreaterThan(0)
  }

  private assertKeywords(assistantText: string, testCase: ApiTestCase): void {
    if (!testCase.shouldContainAny?.length) return
    const matched = ApiResponseValidator.containsAnyKeyword(assistantText, testCase.shouldContainAny)
    expect(
      matched,
      `[${testCase.id}] Response must contain at least one of: [${testCase.shouldContainAny.join(', ')}]\n` +
        `Expected : ${testCase.expectedBehavior}\n` +
        `Actual   : "${assistantText.slice(0, 300)}"`,
    ).toBe(true)
  }

  private assertForbiddenKeywords(assistantText: string, testCase: ApiTestCase): void {
    if (!testCase.shouldNotContain?.length) return
    const lower = assistantText.toLowerCase()
    for (const forbidden of testCase.shouldNotContain) {
      expect(
        lower,
        `[${testCase.id}] Response must NOT contain "${forbidden}"`,
      ).not.toContain(forbidden.toLowerCase())
    }
  }

  private assertRefusal(assistantText: string, testCase: ApiTestCase): void {
    if (!testCase.shouldRefuse) return
    const refused = ApiResponseValidator.refusalCheck(assistantText)
    expect(
      refused,
      `[${testCase.id}] Expected a refusal or safe-fallback response.\n` +
        `Expected : ${testCase.expectedBehavior}\n` +
        `Actual   : "${assistantText.slice(0, 300)}"`,
    ).toBeTruthy()
  }

  private warnSensitiveMention(assistantText: string, testCase: ApiTestCase): void {
    const mention = ApiResponseValidator.checkSensitiveMention(assistantText)
    if (!mention.pass) {
      console.warn(
        `[${testCase.id}] SAFETY WARNING — sensitive keywords detected (not a fail):\n` +
          mention.reasons.map((r: string) => `  • ${r}`).join('\n'),
      )
    }
  }

  private assertNoLeakage(assistantText: string, testCase: ApiTestCase): void {
    const leakage = ApiResponseValidator.checkSensitiveLeakage(assistantText)
    expect(
      leakage.pass,
      `[${testCase.id}] SENSITIVE DATA LEAKAGE detected:\n` +
        leakage.reasons.map((r: string) => `  • ${r}`).join('\n') +
        `\nActual (first 300 chars): "${assistantText.slice(0, 300)}"`,
    ).toBeTruthy()
  }

  private async assertSemanticRelevance(
    assistantText: string,
    testCase: ApiTestCase,
  ): Promise<void> {
    if (!this.hasEmbeddingProvider) {
      console.info(
        `[${testCase.id}] Semantic check skipped — configure AssertionOptions.embeddingProvider to enable HIGH strictness semantic validation.`,
      )
      return
    }

    const reference = testCase.semanticReference ?? testCase.shouldContainAny?.join(' ')
    if (!reference) return

    const threshold = testCase.semanticThreshold ?? this.defaultSemanticThreshold
    const { score, method } = await this.semanticSimilarity.compare(reference, assistantText)

    expect.soft(
      score,
      `[${testCase.id}] Semantic similarity ${score.toFixed(3)} below threshold ${threshold} (${method}).\n` +
        `Reference: "${reference}"\n` +
        `Actual   : "${assistantText.slice(0, 300)}"`,
    ).toBeGreaterThanOrEqual(threshold)
  }
}
