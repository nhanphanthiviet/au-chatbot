/**
 * UI Test Cases: TC-01 to TC-03, TC-11 to TC-14
 * Focus: UI behaviour — does NOT require bot to respond.
 * Uses: ChatbotPage (POM) via Playwright fixture.
 */

import { test, expect } from '../../fixtures/chatbot.fixture'
import { UI_TEST_CASES, UITestCase } from '../../data/datasets'
import { DEFAULT_TIMEOUT_MS as TIMEOUT_MS } from '../../core/helpers/timeouts'

let uiAvailable = true
let uiSkipReason = ''

test.beforeEach(async ({ chatbotRaw }) => {
  if (uiAvailable) {
    uiAvailable = await chatbotRaw.isChatAvailable()
    if (!uiAvailable) {
      uiSkipReason = 'Chat widget is not available/visible on BASE_URL. Skipping UI interaction assertions.'
    }
  }
  test.skip(!uiAvailable, uiSkipReason)
})

function getUiCase(id: string): UITestCase {
  const testCase = UI_TEST_CASES.find((item) => item.id === id)
  if (!testCase) {
    throw new Error(`Missing UI test data for case: ${id}`)
  }
  return testCase
}

// ─── TC-01: Greeting on load ──────────────────────────────────────────────────

const tc01 = getUiCase('TC-01')

test(`[${tc01.id}] ${tc01.description}`, async ({ chatbotRaw }) => {
  const hasGreeting = await chatbotRaw.hasGreeting()
  expect(
    hasGreeting,
    'Expected a greeting/welcome message to appear automatically on page load'
  ).toBe(true)
})

// ─── TC-02: Input field is functional ────────────────────────────────────────

const tc02 = getUiCase('TC-02')

test(`[${tc02.id}] ${tc02.description}`, async ({ chatbot }) => {
  const isVisible = await chatbot.isInputVisible()
  expect(isVisible, 'Input field should be visible').toBe(true)

  await chatbot.typeMessage(tc02.input!)
  const value = await chatbot.getInputValue()
  expect(value).toBe(tc02.input!)
})

// ─── TC-03: Send button present ───────────────────────────────────────────────

const tc03 = getUiCase('TC-03')

test(`[${tc03.id}] ${tc03.description}`, async ({ chatbot }) => {
  await chatbot.typeMessage(tc03.input!)
  const sendBtn = await chatbot.getSendButton()
  await expect(sendBtn).toBeVisible()
  // Button should NOT be disabled when there is text
  const isDisabled = await chatbot.isSendButtonDisabled()
  expect(isDisabled, 'Send button should be enabled when input has text').toBe(false)
})

// ─── TC-11: Empty message not sent ───────────────────────────────────────────

const tc11 = getUiCase('TC-11')

test(`[${tc11.id}] ${tc11.description}`, async ({ chatbot }) => {
  const countBefore = await chatbot.getMessageCount()
  // Try sending empty
  await chatbot.page.keyboard.press('Enter')
  await chatbot.page.waitForTimeout(TIMEOUT_MS.emptyMessageWait)
  const countAfter = await chatbot.getMessageCount()
  expect(countAfter, 'Message count should not increase after sending empty input').toBe(countBefore)
})

// ─── TC-12: Very long input ───────────────────────────────────────────────────

const tc12 = getUiCase('TC-12')

test(`[${tc12.id}] ${tc12.description}`, async ({ chatbot }) => {
  const longInput = tc12.input!
  await chatbot.typeMessage(longInput)
  // Page should not crash
  await expect(chatbot.page).not.toHaveTitle(/error|500|crash/i)
  // Input should accept the text (may be truncated by UI — that's ok)
  const value = await chatbot.getInputValue()
  expect(value.length, 'Input should contain some of the long text').toBeGreaterThan(0)
})

// ─── TC-13: XSS injection ─────────────────────────────────────────────────────

const tc13 = getUiCase('TC-13')

test(`[${tc13.id}] ${tc13.description}`, async ({ chatbot }) => {
  // Listen for dialog (alert) — should never be triggered
  let alertFired = false
  chatbot.page.on('dialog', async dialog => {
    alertFired = true
    await dialog.dismiss()
  })

  await chatbot.sendMessage(tc13.input!)
  await chatbot.page.waitForTimeout(TIMEOUT_MS.xssWait)

  expect(alertFired, 'XSS alert should NOT have been triggered').toBe(false)
  // Page should still be functional
  await expect(chatbot.page).not.toHaveTitle(/error/i)
})

// ─── TC-14: Enter key sends message ──────────────────────────────────────────

const tc14 = getUiCase('TC-14')

test(`[${tc14.id}] ${tc14.description}`, async ({ chatbot }) => {
  await chatbot.typeMessage(tc14.input!)
  await chatbot.page.keyboard.press('Enter')
  await chatbot.page.waitForTimeout(TIMEOUT_MS.xssWait)
  const inputValue = await chatbot.getInputValue()
  expect(inputValue.trim(), 'Input should be cleared after pressing Enter (message was sent)').toBe('')
})
