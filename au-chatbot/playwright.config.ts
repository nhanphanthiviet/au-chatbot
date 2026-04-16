import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, TIMEOUT_MS } from './constants/constants'

export default defineConfig({
  testDir: './tests',
  timeout: TIMEOUT_MS.testCase, // 90s per test — bot can be slow
  retries: 1,
  workers: 1,              // serial — one browser session at a time
  reporter: [
    ['html', { outputFolder: 'report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
