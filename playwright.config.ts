import { defineConfig } from '@playwright/test';
const port=Number(process.env.EP_TEST_PORT || 4174);
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, expect: { timeout: 7000 }, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }, trace: 'retain-on-failure' },
  webServer: { command: `node server.mjs --port ${port}`, url: `http://127.0.0.1:${port}/api/health`, reuseExistingServer: true, timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'evidence/browser-results.json' }]]
});
