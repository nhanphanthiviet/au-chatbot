/**
 * Promptfoo Custom Provider for bythanh.com chatbot
 *
 * Reuses ChatbotPage (POM) to interact with the bot.
 * Simulates the fixture pattern via a `withChatbot` wrapper.
 *
 * Run: npm run eval
 */

import { chromium, Browser } from '@playwright/test'
import { ChatbotPage } from '../pages/chatbotPage'
import defaultConfig from '../configs/default.json'

const BOT_TIMEOUT_MS = defaultConfig.botTimeout
const BASE_URL = process.env.BASE_URL || 'https://bythanh.com'

// ─── Browser singleton ────────────────────────────────────────────────────────
// Reuse one browser across all concurrent test cases.
// Using a promise singleton avoids race conditions when maxConcurrency > 1:
// multiple callApi() calls hitting this simultaneously all await the same promise.

let browserPromise: Promise<Browser> | null = null

async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: defaultConfig.headlessMode }).catch((err) => {
      browserPromise = null   // reset so next call retries
      throw err
    })
  }
  return browserPromise
}

async function withChatbot<T>(fn: (chatbot: ChatbotPage) => Promise<T>): Promise<T> {
  const browser = await getSharedBrowser()
  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()
  try {
    const chatbot = new ChatbotPage(page)
    await chatbot.open()
    await chatbot.openChat()
    return await fn(chatbot)
  } finally {
    await context.close()   // close context (tab), keep browser alive
  }
}

// ─── Promptfoo Provider Interface ─────────────────────────────────────────────

interface ProviderContext {
  vars?: Record<string, string>
}

export default class BythanhChatbotProvider {
  id() {
    return 'bythanh-chatbot-playwright'
  }

  async callApi(prompt: string, context?: ProviderContext) {
    const followUp = context?.vars?.followUp

    try {
      const result = await withChatbot(async (chatbot) => {
        // Turn 1
        await chatbot.sendMessage(prompt)
        const turn1 = await chatbot.waitForBotResponse(BOT_TIMEOUT_MS)

        if (!turn1.responded) {
          return {
            error: `Bot did not respond within ${BOT_TIMEOUT_MS / 1000}s`,
            tokenUsage: {},
          }
        }

        // Turn 2 (TC-15 multi-turn): send followUp in the same session
        if (followUp) {
          await chatbot.sendMessage(followUp)
          const turn2 = await chatbot.waitForBotResponse(BOT_TIMEOUT_MS)

          if (!turn2.responded) {
            return {
              error: `Bot did not respond to follow-up within ${BOT_TIMEOUT_MS / 1000}s`,
              tokenUsage: {},
            }
          }

          return {
            output: turn2.text,
            tokenUsage: {},
            metadata: {
              latencyMs: turn1.elapsedMs + turn2.elapsedMs,
              url: BASE_URL,
            },
          }
        }

        return {
          output: turn1.text,
          tokenUsage: {},
          metadata: {
            latencyMs: turn1.elapsedMs,
            url: BASE_URL,
          },
        }
      })

      return result
    } catch (err: unknown) {
      return {
        error: `Provider error: ${err instanceof Error ? err.message : String(err)}`,
        tokenUsage: {},
      }
    }
  }
}
