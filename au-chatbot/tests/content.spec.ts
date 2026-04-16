/**
 * Content Test Cases: TC-04 to TC-10, TC-15
 * Focus: Bot response quality — tested via direct chatbot API.
 */

import 'dotenv/config'
import { test, expect } from '@playwright/test'
import { CONTENT_TEST_CASES, ContentTestCase } from '../data/testData'
import { ChatbotApiService, loadChatbotApiConfig } from '../service/api/chatbotApi.service'

const apiService = new ChatbotApiService(loadChatbotApiConfig())

function getContentCase(id: string): ContentTestCase {
  const testCase = CONTENT_TEST_CASES.find((item) => item.id === id)
  if (!testCase) {
    throw new Error(`Missing content test data for case: ${id}`)
  }
  return testCase
}

// ─── Data-driven: TC-04 to TC-10 (single-turn) ───────────────────────────────

const singleTurnCases = CONTENT_TEST_CASES.filter(tc => !tc.followUp)

for (const tc of singleTurnCases) {
  test(`[${tc.id}] ${tc.description}`, async () => {
    const startedAt = Date.now()
    const { text } = await apiService.sendMessage(tc.question)
    const elapsedMs = Date.now() - startedAt
    expect(text.trim().length, 'Bot response should not be empty').toBeGreaterThan(0)

    // ── TC-04 specific: response time < 30s ────────────────────────────────
    if (tc.id === 'TC-04') {
      expect(
        elapsedMs,
        `Expected response in under 30s but got ${(elapsedMs / 1000).toFixed(1)}s`
      ).toBeLessThan(30_000)
    }

    // ── Keyword check ───────────────────────────────────────────────────────
    if (tc.shouldContainAny && tc.shouldContainAny.length > 0) {
      const lowerText = text.toLowerCase()
      const matched = tc.shouldContainAny.some(k => lowerText.includes(k.toLowerCase()))
      expect(
        matched,
        `Response should contain at least one of: [${tc.shouldContainAny.join(', ')}]\nActual response: "${text}"`
      ).toBe(true)
    }

    // ── Negative keyword check ──────────────────────────────────────────────
    if (tc.shouldNotContain && tc.shouldNotContain.length > 0) {
      for (const forbidden of tc.shouldNotContain) {
        expect(
          text.toLowerCase(),
          `Response must NOT contain "${forbidden}" (privacy/accuracy violation)\nActual: "${text}"`
        ).not.toContain(forbidden.toLowerCase())
      }
    }
  })
}

// ─── TC-15: Multi-turn conversation ──────────────────────────────────────────

const tc15 = getContentCase('TC-15')

test(`[${tc15.id}] ${tc15.description}`, async () => {
  // Turn 1
  const turn1 = await apiService.sendMessage(tc15.question)
  expect(turn1.text.trim().length, 'Turn 1 response should not be empty').toBeGreaterThan(0)

  if (tc15.shouldContainAny) {
    const matched = tc15.shouldContainAny.some(k =>
      turn1.text.toLowerCase().includes(k.toLowerCase())
    )
    expect(
      matched,
      `Turn 1 response should contain at least one of: [${tc15.shouldContainAny.join(', ')}]\nActual: "${turn1.text}"`
    ).toBe(true)
  }

  // Turn 2: follow-up
  const turn2 = await apiService.sendMessage(tc15.followUp!)
  expect(turn2.text.trim().length, 'Turn 2 response should not be empty').toBeGreaterThan(0)

  // Follow-up should add new info, not repeat verbatim
  expect(
    turn2.text,
    'Follow-up response should not be identical to first response'
  ).not.toBe(turn1.text)

  // Should still be about Thanh (context maintained)
  expect(
    turn2.text.toLowerCase(),
    'Follow-up should still reference Thanh or his career'
  ).toMatch(/thanh|career|work|professional|experience|role/i)
})
