import { expect } from '@playwright/test'
import type { TestInfo } from '@playwright/test'
import type { EmbeddingProvider } from '../../core/ai/types'
import { ApiResponseValidator } from '../../core/ai/evaluation'
import { SemanticSimilarity } from '../../core/ai/similarity/SemanticSimilarity'
import type { ApiResult } from '../../core/common/errors'
import type { ApiTestCase } from '../../data/apiTestDataset'
import type { ChatbotApiTestResponse } from './chatbotApiTest.service'

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

  // ── Public API ─────────────────────────────────────────────────────────────

  async assertCase(
    testCase: ApiTestCase,
    result: ApiResult<ChatbotApiTestResponse>,
    testInfo?: TestInfo,
  ): Promise<void> {
    // ── Infrastructure failure — surface before AI assertions ─────────────
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

    // ── Latency annotation (always, regardless of strictness) ─────────────
    testInfo?.annotations.push({
      type: 'latency_ms',
      description: `${testCase.id}: ${data.elapsedMs}ms`,
    })

    // ── LOW ─────────────────────────────────────────────────────────────────
    this.assertStatus(data, testCase)
    this.assertLatency(data, testCase)
    this.assertResponseStructure(data, testCase)
    this.assertNonEmpty(assistantText, testCase)

    if (testCase.strictness === 'LOW') return

    // ── MEDIUM ───────────────────────────────────────────────────────────────
    this.assertKeywords(assistantText, testCase)
    this.assertForbiddenKeywords(assistantText, testCase)
    this.assertRefusal(assistantText, testCase)
    this.warnSensitiveMention(assistantText, testCase)

    if (testCase.strictness === 'MEDIUM') return

    // ── HIGH ─────────────────────────────────────────────────────────────────
    this.assertNoLeakage(assistantText, testCase)
    await this.assertSemanticRelevance(assistantText, testCase)
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  private assertStatus(data: ChatbotApiTestResponse, testCase: ApiTestCase): void {
    expect(
      data.status,
      `[${testCase.id}] Expected HTTP ${testCase.expectedStatus}, received ${data.status}`,
    ).toBe(testCase.expectedStatus)
  }

  // ── Latency ────────────────────────────────────────────────────────────────

  private assertLatency(data: ChatbotApiTestResponse, testCase: ApiTestCase): void {
    expect(
      data.elapsedMs,
      `[${testCase.id}] Latency ${data.elapsedMs}ms exceeded per-case limit of ${testCase.maxLatencyMs}ms`,
    ).toBeLessThan(testCase.maxLatencyMs)
  }

  // ── Response Structure ─────────────────────────────────────────────────────

  private assertResponseStructure(data: ChatbotApiTestResponse, testCase: ApiTestCase): void {
    const hasStructure =
      ApiResponseValidator.hasExpectedResponseStructure(data.rawBody) ||
      typeof data.rawBody === 'string'
    expect(
      hasStructure,
      `[${testCase.id}] Response body lacks expected fields (data/message/text/answer) or plain text`,
    ).toBeTruthy()
  }

  // ── Non-Empty ──────────────────────────────────────────────────────────────

  private assertNonEmpty(assistantText: string, testCase: ApiTestCase): void {
    expect(
      assistantText.trim().length,
      `[${testCase.id}] Response text is empty`,
    ).toBeGreaterThan(0)
  }

  // ── Keyword Relevance ──────────────────────────────────────────────────────

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

  // ── Forbidden Keywords ─────────────────────────────────────────────────────

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

  // ── Refusal ────────────────────────────────────────────────────────────────

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

  // ── Safety: Mention (WARNING only — MEDIUM+) ──────────────────────────────
  // Sensitive keyword presence in a refusal is normal; this never fails the test.

  private warnSensitiveMention(assistantText: string, testCase: ApiTestCase): void {
    const mention = ApiResponseValidator.checkSensitiveMention(assistantText)
    if (!mention.pass) {
      console.warn(
        `[${testCase.id}] SAFETY WARNING — sensitive keywords detected (not a fail):\n` +
          mention.reasons.map((r) => `  • ${r}`).join('\n'),
      )
    }
  }

  // ── Safety: Strict Leakage (FAIL — HIGH only) ─────────────────────────────
  // Actual data patterns (bearer tokens, API keys, phone numbers, etc.) → test FAILS.

  private assertNoLeakage(assistantText: string, testCase: ApiTestCase): void {
    const leakage = ApiResponseValidator.checkSensitiveLeakage(assistantText)
    expect(
      leakage.pass,
      `[${testCase.id}] SENSITIVE DATA LEAKAGE detected:\n` +
        leakage.reasons.map((r) => `  • ${r}`).join('\n') +
        `\nActual (first 300 chars): "${assistantText.slice(0, 300)}"`,
    ).toBeTruthy()
  }

  // ── Semantic Relevance (HIGH only) ────────────────────────────────────────
  // Requires an embedding provider — skipped gracefully when none is configured.

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

    // Soft assertion: semantic scores are approximate; surface without hard-blocking.
    expect.soft(
      score,
      `[${testCase.id}] Semantic similarity ${score.toFixed(3)} below threshold ${threshold} (${method}).\n` +
        `Reference: "${reference}"\n` +
        `Actual   : "${assistantText.slice(0, 300)}"`,
    ).toBeGreaterThanOrEqual(threshold)
  }
}
