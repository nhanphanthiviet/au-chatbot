import 'dotenv/config'
import { expect, test } from '@playwright/test'
import { PerformanceTracker } from '../../core/ai/performance'
import {
  API_TEST_CASES,
  getApiCategoryCount,
  getApiTestCase,
} from '../../data/apiTestDataset'
import { ApiChatbotAssertionService } from '../../service/api/ApiChatbotAssertionService'
import {
  ChatbotApiTestService,
  loadChatbotApiTestConfig,
} from '../../service/api/chatbotApiTest.service'

const apiService = new ChatbotApiTestService(loadChatbotApiTestConfig())
const assertionService = new ApiChatbotAssertionService()
const suitePerformanceTracker = new PerformanceTracker()

/**
 * API Test Cases — driven entirely by the dataset in data/apiTestDataset.ts.
 *
 * Each test case declares its own expectedStatus, maxLatencyMs, and strictness.
 * All assertion logic lives in ApiChatbotAssertionService — this spec is pure
 * orchestration: send → assert.
 */
for (const tc of API_TEST_CASES) {
  test(`[${tc.id}] ${tc.description}`, async ({ request }) => {
    const result = await apiService.sendMessage(request, tc.content, { retries: tc.retries })

    // Record latency for suite-level performance summary (success path only).
    if (result.success) {
      suitePerformanceTracker.record(result.data.elapsedMs)
    }

    await assertionService.assertCase(tc, result, test.info())
  })
}

// ─── Dataset sanity check ─────────────────────────────────────────────────────

test('[TC-API-DATA] Dataset has all required categories', async () => {
  const categoryCount = getApiCategoryCount()

  expect(categoryCount.functional, 'Dataset should include functional cases').toBeGreaterThan(0)
  expect(categoryCount.edge, 'Dataset should include edge cases').toBeGreaterThan(0)
  expect(categoryCount.negative, 'Dataset should include negative cases').toBeGreaterThan(0)
  expect(categoryCount.security, 'Dataset should include security cases').toBeGreaterThan(0)
  expect(categoryCount.multilingual, 'Dataset should include multilingual cases').toBeGreaterThan(0)
})

// ─── Spot-check helper for style consistency ─────────────────────────────────

const tc16 = getApiTestCase('TC-16')
test(`[${tc16.id}] dataset lookup should be valid`, async () => {
  expect(tc16.content.length, 'TC-16 should have request content').toBeGreaterThan(0)
})

test('[TC-API-PERF] Suite latency summary', async () => {
  const stats = suitePerformanceTracker.stats()
  expect(stats.count, 'Suite should collect at least one latency sample').toBeGreaterThan(0)
  test.info().annotations.push({
    type: 'suite_latency',
    description: `count=${stats.count}, p50=${stats.p50.toFixed(0)}ms, p95=${stats.p95.toFixed(0)}ms, p99=${stats.p99.toFixed(0)}ms`,
  })
})
