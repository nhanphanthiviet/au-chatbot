import { Locator, Page } from '@playwright/test'

export class BasePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  protected locator(selector: string): Locator {
    return this.page.locator(selector)
  }

  protected first(selector: string): Locator {
    return this.locator(selector).first()
  }

  async navigate(path = '/'): Promise<void> {
    await this.page.goto(path)
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle')
  }
}
