import { Page, Locator } from '@playwright/test'
import { DEFAULT_TIMEOUT_MS as TIMEOUT_MS } from '../core/helpers/timeouts'

export class ChatbotPage {
  readonly page: Page

  // Selectors — update if website changes
  private readonly chatTriggerSel = '#robotContainer, [class*="robot_robotContainer"], [class*="chat-trigger"], [class*="chatbot-trigger"], button:has-text("Chat"), a:has-text("Chat now")'
  private readonly inputSel       = 'input[class*="chat_input"], input[type="text"], textarea, [contenteditable="true"], [placeholder*="question" i], [placeholder*="message" i], [placeholder*="chat" i], [placeholder*="ask" i], [placeholder*="type" i]'
  private readonly sendBtnSel     = '[class*="chat_button"], button[type="submit"], button:has-text("Send"), button:has-text("G\u1eedi"), [aria-label*="send" i]'
  private readonly messageSel     = '[class*="assistantMessage"], [class*="chat_messages"] > div, [class*="message"], [class*="bubble"]'
  private readonly botMessageSel  = '[class*="assistantMessage"]'

  constructor(page: Page) {
    this.page = page
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  async open() {
    const target = new URL('/', process.env.BASE_URL).toString()
    await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS.testCase })
    await this.page.waitForLoadState('load', { timeout: TIMEOUT_MS.inputVisible * 3 }).catch(() => {})
  }

  // ─── Chat Interaction ──────────────────────────────────────────────────────

  async openChat(): Promise<boolean> {
    // Check if chat input is already visible (chatbot embedded and auto-opened)
    const input = this.page.locator(this.inputSel).first()
    const alreadyOpen = await input.isVisible({ timeout: TIMEOUT_MS.openChatInputVisible }).catch(() => false)
    if (alreadyOpen) return true

    // Prefer #robotContainer — broad selectors can match a wrapper that React replaces (detached mid-click)
    const robot = this.page.locator('#robotContainer').first()
    for (let attempt = 0; attempt < 2; attempt++) {
      if (await robot.isVisible({ timeout: TIMEOUT_MS.openChatTriggerVisible }).catch(() => false)) {
        await robot.scrollIntoViewIfNeeded().catch(() => {})
        await robot.evaluate((el) => (el as HTMLElement).click()).catch(async () => {
          await robot.click({ force: true, timeout: 5000 }).catch(() => {})
        })
        if (await input.isVisible({ timeout: TIMEOUT_MS.inputVisible }).catch(() => false)) return true
        await this.page.waitForTimeout(300).catch(() => {})
        continue
      }

      const trigger = this.page.locator(this.chatTriggerSel).first()
      if (await trigger.isVisible({ timeout: TIMEOUT_MS.openChatTriggerVisible }).catch(() => false)) {
        await trigger.scrollIntoViewIfNeeded().catch(() => {})
        await trigger.evaluate((el) => (el as HTMLElement).click()).catch(async () => {
          await trigger.click({ force: true, timeout: 5000 }).catch(() => {})
        })
        if (await input.isVisible({ timeout: TIMEOUT_MS.inputVisible }).catch(() => false)) return true
      }
      await this.page.waitForTimeout(300).catch(() => {})
    }

    return false
  }

  async isChatAvailable(): Promise<boolean> {
    const inputVisible = await this.page
      .locator(this.inputSel)
      .first()
      .isVisible({ timeout: TIMEOUT_MS.openChatInputVisible })
      .catch(() => false)
    if (inputVisible) return true

    const triggerVisible = await this.page
      .locator(this.chatTriggerSel)
      .first()
      .isVisible({ timeout: TIMEOUT_MS.openChatTriggerVisible })
      .catch(() => false)
    return triggerVisible
  }

  async getInputField(): Promise<Locator> {
    return this.page.locator(this.inputSel).first()
  }

  async getSendButton(): Promise<Locator> {
    return this.page.locator(this.sendBtnSel).first()
  }

  async typeMessage(message: string) {
    const input = this.page.locator(this.inputSel).first()
    try {
      await input.waitFor({ state: 'visible', timeout: TIMEOUT_MS.inputVisible })
      await input.fill(message)
    } catch {
      await this.openChat()
      const inputAgain = this.page.locator(this.inputSel).first()
      await inputAgain.waitFor({ state: 'visible', timeout: TIMEOUT_MS.inputVisible })
      await inputAgain.fill(message)
    }
  }

  async sendMessage(message: string) {
    await this.typeMessage(message)
    const send = await this.getSendButton()
    const sendVisible = await send.isVisible({ timeout: TIMEOUT_MS.openChatInputVisible }).catch(() => false)
    if (sendVisible) {
      await send.click({ force: true }).catch(() => this.page.keyboard.press('Enter'))
    } else {
      await this.page.keyboard.press('Enter')
    }
  }

  async pressEnterToSend(message: string) {
    await this.openChat().catch(() => false)
    await this.typeMessage(message)
    await this.page.keyboard.press('Enter')
  }

  // ─── Response Handling ─────────────────────────────────────────────────────

  /**
   * Wait for a bot response to appear.
   * Returns { responded: boolean, elapsedMs: number, text: string }
   */
  async waitForBotResponse(timeoutMs = 60_000): Promise<{ responded: boolean; elapsedMs: number; text: string }> {
    const start = Date.now()
    const countBefore = await this.page.locator(this.botMessageSel).count()
    // Snapshot full body text as baseline so we can extract only what the bot added
    const textBefore = await this.page.evaluate(() => document.body.innerText)

    try {
      // Wait until a new assistant message appears OR significant text growth
      await this.page.waitForFunction(
        ({ botSel, prevCount, prevLen }: { botSel: string; prevCount: number; prevLen: number }) => {
          const msgs = document.querySelectorAll(botSel)
          const newElementDetected = msgs.length > prevCount
          // Fallback: detect bot response via significant page text growth (>50 chars)
          const textGrown = document.body.innerText.length > prevLen + 50
          return newElementDetected || textGrown
        },
        { botSel: this.botMessageSel, prevCount: countBefore, prevLen: textBefore.length },
        { timeout: timeoutMs }
      )

      // Wait for the "waiting/typing" indicator to disappear (bot finished generating)
      const remainingMs = Math.max(timeoutMs - (Date.now() - start), 10_000)
      await this.page.locator('#waitingMessage, [class*="waitingMessage"]').waitFor({ state: 'hidden', timeout: remainingMs }).catch(() => {})

      // Wait for response text to stabilize (not just dots / still streaming)
      const stabilizeDeadline = Date.now() + remainingMs
      let stableText = ''
      let previousText = ''
      let stableCount = 0
      while (Date.now() < stabilizeDeadline) {
        const current = await this.getLastBotMessage()
        const isOnlyDots = /^\.+$/.test(current.trim())
        if (!isOnlyDots && current === previousText && current.trim().length > 0) {
          stableCount++
          if (stableCount >= 2) { stableText = current; break }
        } else {
          stableCount = 0
        }
        previousText = current
        await this.page.waitForTimeout(500)
      }

      const elapsedMs = Date.now() - start

      // Try specific bot message selector first (most accurate)
      let text = stableText || await this.getLastBotMessage()

      // Fallback: extract only the NEW portion of page text
      if (!text) {
        const textAfter = await this.page.evaluate(() => document.body.innerText)
        text = textAfter.slice(textBefore.length).trim()
      }

      return { responded: true, elapsedMs, text }
    } catch {
      return { responded: false, elapsedMs: Date.now() - start, text: '' }
    }
  }

  async getLastBotMessage(): Promise<string> {
    // Use the specific bot/assistant message selector, excluding the waiting/typing indicator
    const botMessages = this.page.locator(`${this.botMessageSel}:not(#waitingMessage):not([class*="waitingMessage"])`)
    const botCount = await botMessages.count()
    if (botCount > 0) {
      return (await botMessages.last().innerText()).trim()
    }

    return ''
  }

  async getAllMessages(): Promise<string[]> {
    const messages = this.page.locator(this.messageSel)
    const count = await messages.count()
    const texts: string[] = []
    for (let i = 0; i < count; i++) {
      texts.push((await messages.nth(i).innerText()).trim())
    }
    return texts
  }

  async getMessageCount(): Promise<number> {
    return this.page.locator(this.messageSel).count()
  }

  // ─── State Checks ──────────────────────────────────────────────────────────

  async isInputVisible(): Promise<boolean> {
    return this.page.locator(this.inputSel).first()
      .waitFor({ state: 'visible', timeout: TIMEOUT_MS.inputVisible })
      .then(() => true)
      .catch(() => false)
  }

  async isSendButtonDisabled(): Promise<boolean> {
    const btn = await this.getSendButton()
    const disabled = await btn.getAttribute('disabled')
    const ariaDisabled = await btn.getAttribute('aria-disabled')
    return disabled !== null || ariaDisabled === 'true'
  }

  async getInputValue(): Promise<string> {
    const input = await this.getInputField()
    // inputValue() works for <input>/<textarea>; contenteditable needs innerText()
    return input.inputValue().catch(async () => {
      return (await input.innerText().catch(() => '')).trim()
    })
  }

  async hasGreeting(): Promise<boolean> {
    const byCopy = this.page.getByText(/welcome to byThanh|What can I help you with/i).first()
    if (await byCopy.isVisible({ timeout: TIMEOUT_MS.greetingVisible }).catch(() => false)) {
      return true
    }
    const firstBubble = this.page.locator(this.messageSel).first()
    if (await firstBubble.waitFor({ state: 'visible', timeout: TIMEOUT_MS.greetingVisible }).then(() => true).catch(() => false)) {
      return true
    }
    const body = await this.getFullPageText().catch(() => '')
    return /\bwelcome to byThanh\b/i.test(body) || /\bWhat can I help you with\b/i.test(body)
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  async screenshot(path: string) {
    await this.page.screenshot({ path, fullPage: true })
  }

  async getFullPageText(): Promise<string> {
    return this.page.evaluate(() => document.body.innerText)
  }
}