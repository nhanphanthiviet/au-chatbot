import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'
import defaultConfig from './configs/default.json'

const TEST_TIMEOUT_MS = defaultConfig.botTimeout
const BASE_URL = process.env.BASE_URL

export default defineConfig({
  testDir: './tests',
  timeout: TEST_TIMEOUT_MS,
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
