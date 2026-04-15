import 'dotenv/config'
import { expect, test } from '@playwright/test'
import { PerformanceTracker } from '../../core/ai/performance/tracker'
import {
  API_TEST_CASES,
  getApiCategoryCount,
  getApiTestCase,
} from '../../data/datasets'
import {
  ApiChatbotAssertionService,
  ChatbotApiTestService,
  probeChatbotApi,
  loadChatbotApiConfig,
  loadChatbotApiTestConfig,
} from '../../service/chatbot'

const apiConfig = loadChatbotApiTestConfig()
const hasRequiredEnv = !!apiConfig.baseUrl && !!apiConfig.threadId
let canRunApiSuite = hasRequiredEnv
let skipReason = 'Set CHATBOT_API_BASE_URL and CHATBOT_THREAD_ID in .env to run API tests'

const apiService = new ChatbotApiTestService(apiConfig)
const assertionService = new ApiChatbotAssertionService()
const suitePerformanceTracker = new PerformanceTracker()

test.beforeAll(async () => {
  if (!hasRequiredEnv) return
  const probe = await probeChatbotApi(loadChatbotApiConfig())
  if (!probe.ok) {
    canRunApiSuite = false
    skipReason =
      probe.reason ??
      `Chatbot API is unavailable for API suite (status ${probe.status}). Check thread/API health.`
  }
})

/**
 * API Test Cases — driven entirely by the dataset in data/datasets.ts.
 *
 * Each test case declares its own expectedStatus, maxLatencyMs, and strictness.
 * All assertion logic lives in ApiChatbotAssertionService — this spec is pure
 * orchestration: send → assert.
 */
for (const tc of API_TEST_CASES) {
  test(`[${tc.id}] ${tc.description}`, async ({ request }) => {
    test.skip(!canRunApiSuite, skipReason)

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
  test.skip(!canRunApiSuite, skipReason)

  const stats = suitePerformanceTracker.stats()
  expect(stats.count, 'Suite should collect at least one latency sample').toBeGreaterThan(0)
  test.info().annotations.push({
    type: 'suiteLatency',
    description: `count=${stats.count}, p50=${stats.p50.toFixed(0)}ms, p95=${stats.p95.toFixed(0)}ms, p99=${stats.p99.toFixed(0)}ms`,
  })
})
