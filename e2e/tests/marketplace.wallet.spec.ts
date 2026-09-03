import { expect, test } from '@playwright/test';

/* Signing in with a wallet, driven by the in-app test wallet the marketplace
   registers when VITE_TEST_WALLET is set (docs/06-testing.md). A real Slush
   user takes the same path through dapp-kit; here the app signs the challenge
   with a fixture key so no extension is driven. */
test('signs in with a wallet and lands on the portfolio', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('wallet-sign-in').click();
  await page.waitForURL('**/portfolio');
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Signed in as 0x/ })).toBeVisible();
});
