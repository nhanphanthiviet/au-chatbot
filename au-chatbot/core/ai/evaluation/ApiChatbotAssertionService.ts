import { expect } from '@playwright/test'
import type { ApiTestCase } from '../../../data/apiTestDataset'
import type { ChatbotApiResult } from '../../../service/api/chatbotApiTest.service'
import { ApiResponseValidator } from './ApiResponseValidator'

export interface AssertionOutcome {
  assistantText: string
  latencyMs?: number
  warnings: string[]
}

/**
 * @deprecated Use ApiChatbotAssertionService from service/api/ApiChatbotAssertionService.ts
 * which provides async assertCase(), per-strictness assertion levels, and proper semantic validation.
 * This class is kept for reference only and will be removed in a future cleanup.
 */
export class ApiChatbotAssertionService {
  static assertCase(testCase: ApiTestCase, apiResult: ChatbotApiResult): AssertionOutcome {
    if (!apiResult.success) {
      const details = [
        `Infrastructure failure type: ${apiResult.error.type}`,
        `Message: ${apiResult.error.message}`,
        `URL: ${apiResult.error.url}`,
        apiResult.error.status ? `Status: ${apiResult.error.status}` : '',
        apiResult.error.responseSnippet ? `Snippet: ${apiResult.error.responseSnippet}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      expect(apiResult.success, details).toBeTruthy()
      return { assistantText: '', warnings: [] }
    }

    const response = apiResult.data
    const assistantText =
      ApiResponseValidator.extractAssistantText(response.rawBody) || response.responseText
    const warnings: string[] = []

    expect(response.status, `Unexpected status for ${testCase.id}`).toBe(testCase.expectedStatus)
    expect(
      ApiResponseValidator.hasExpectedResponseStructure(response.rawBody) ||
        typeof response.rawBody === 'string',
      `Response structure invalid for ${testCase.id}`,
    ).toBeTruthy()
    expect(assistantText.trim().length, `Response should not be empty for ${testCase.id}`).toBeGreaterThan(0)

    if (testCase.strictness !== 'LOW' && testCase.shouldContainAny?.length) {
      const matched = ApiResponseValidator.containsAnyKeyword(assistantText, testCase.shouldContainAny)
      expect(
        matched,
        `Missing expected keywords [${testCase.shouldContainAny.join(', ')}] for ${testCase.id}`,
      ).toBeTruthy()
    }

    if (testCase.shouldNotContain?.length) {
      for (const forbidden of testCase.shouldNotContain) {
        expect(
          assistantText.toLowerCase(),
          `Response must NOT contain "${forbidden}" for ${testCase.id}`,
        ).not.toContain(forbidden.toLowerCase())
      }
    }

    if (testCase.shouldRefuse && testCase.strictness !== 'LOW') {
      expect(
        ApiResponseValidator.refusalCheck(assistantText),
        `Expected refusal behavior for ${testCase.id}`,
      ).toBeTruthy()
    }

    const safety = ApiResponseValidator.safetyCheck(assistantText)
    if (safety.mentionWarnings.length > 0) {
      warnings.push(...safety.mentionWarnings)
    }
    expect(
      safety.pass,
      `Sensitive leakage detected for ${testCase.id}: ${safety.leakageReasons.join('; ') || 'none'}`,
    ).toBeTruthy()

    if (testCase.strictness === 'HIGH' && testCase.semanticReference) {
      const score = ApiResponseValidator.lexicalSemanticScore(testCase.semanticReference, assistantText)
      const threshold = testCase.semanticThreshold ?? 0.15
      expect(
        score,
        `Semantic score ${score.toFixed(3)} below threshold ${threshold} for ${testCase.id}`,
      ).toBeGreaterThanOrEqual(threshold)
    }

    expect(
      response.elapsedMs,
      `Latency ${response.elapsedMs}ms exceeds ${testCase.maxLatencyMs}ms for ${testCase.id}`,
    ).toBeLessThan(testCase.maxLatencyMs)

    return {
      assistantText,
      latencyMs: response.elapsedMs,
      warnings,
    }
  }
}
