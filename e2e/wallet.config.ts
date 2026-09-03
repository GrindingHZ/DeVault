import { defineConfig, devices } from '@playwright/test';

/* The wallet sign in spec runs on its own, not in the suite: it needs a
   marketplace dev server started with VITE_TEST_WALLET=1 and an api that
   carries the wallet endpoints, which the compose build does not. Run it with
   `pnpm test:e2e:wallet` after starting those two (docs/06-testing.md). */
export default defineConfig({
  testDir: './tests',
  testMatch: /marketplace\.wallet\.spec\.ts/,
  timeout: 60_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5373' },
});
