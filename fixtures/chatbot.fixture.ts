import { test as base } from '@playwright/test'
import { ChatbotPage } from '../pages/chatbotPage'

// ─── Fixture Types ────────────────────────────────────────────────────────────

type ChatbotFixtures = {
  chatbot: ChatbotPage          // page opened + chat ready
  chatbotRaw: ChatbotPage       // page opened but chat NOT triggered
}

// ─── Fixture Definitions ──────────────────────────────────────────────────────

export const test = base.extend<ChatbotFixtures>({
  /**
   * `chatbot` — opens page and triggers the chat panel automatically.
   * Use this for most content and interaction tests.
   */
  chatbot: async ({ page }, use) => {
    const chatbot = new ChatbotPage(page)
    await chatbot.open()
    await chatbot.openChat()        // try to open chat panel if behind a trigger
    await use(chatbot)
    // teardown: nothing special needed — page closes automatically
  },

  /**
   * `chatbotRaw` — only opens the page, does NOT click any chat trigger.
   * Use this for load/greeting tests where you want to observe initial state.
   */
  chatbotRaw: async ({ page }, use) => {
    const chatbot = new ChatbotPage(page)
    await chatbot.open()
    await use(chatbot)
  },
})

export { expect } from '@playwright/test'