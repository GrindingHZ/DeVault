import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { photographBytes } from './support/photograph';

const apiBase = 'http://localhost:3000/api/v1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;

async function registerMember(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/auth/register`, { data: { email, password } });
  expect(response.status()).toBe(201);
}

/* Seed the loan through the API and drive only the trade through the UI
   (docs/06-testing.md). */
async function issueReceiptFor(request: APIRequestContext, borrowerEmail: string): Promise<string> {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'staff@demo.test', password: 'demo-password-123' },
  });
  const begun = await request.post(`${apiBase}/vaults/VAULT-DEMO-1/intakes`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      borrowerEmail,
      itemCategory: 'BULLION',
      itemDescription: 'One kilogram gold bar',
    },
  });
  expect(begun.status()).toBe(201);
  const intakeId = ((await begun.json()) as { id: string }).id;

  await request.patch(`${apiBase}/intakes/${intakeId}`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { sealNumber: `SEAL-${randomUUID().slice(0, 8)}` },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/photos`, {
    multipart: {
      photo: {
        name: 'front.jpg',
        mimeType: 'image/jpeg',
        buffer: photographBytes(),
      },
    },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/appraisals`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      value: { minorUnits: '500000', currency: 'USD' },
      method: 'spot times weight',
      comparableReferences: 'LBMA',
    },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/seal`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  const issued = await request.post(`${apiBase}/intakes/${intakeId}/issue-receipt`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { insurancePolicyReference: 'POL-E2E' },
  });
  expect(issued.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
  return ((await issued.json()) as { id: string }).id;
}

async function fundAccount(
  request: APIRequestContext,
  email: string,
  minorUnits: string,
): Promise<void> {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'ops@demo.test', password: 'demo-password-123' },
  });
  const deposit = await request.post(`${apiBase}/me/deposits`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { email, amount: { minorUnits, currency: 'USD' } },
  });
  expect(deposit.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
}

async function originateLoan(
  request: APIRequestContext,
  borrowerEmail: string,
  lenderEmail: string,
  receiptId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await request.post(`${apiBase}/auth/login`, { data: { email: borrowerEmail, password } });
  const listing = await request.post(`${apiBase}/listings`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      receiptId,
      requestedPrincipal: { minorUnits: '250000', currency: 'USD' },
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: 30 * oneDay,
      requestedLifetimeMs: 3_600_000,
    },
  });
  expect(listing.status()).toBe(201);
  const listingId = ((await listing.json()) as { id: string }).id;
  await request.post(`${apiBase}/listings/${listingId}/publish`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });

  await request.post(`${apiBase}/auth/login`, { data: { email: lenderEmail, password } });
  const offer = await request.post(`${apiBase}/listings/${listingId}/offers`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      principal: { minorUnits: '250000', currency: 'USD' },
      annualPercentageRateBasisPoints: 1800,
      durationMs: 30 * oneDay,
      expiresAt,
    },
  });
  expect(offer.status()).toBe(201);
  const offerId = ((await offer.json()) as { id: string }).id;

  await request.post(`${apiBase}/auth/login`, { data: { email: borrowerEmail, password } });
  const accepted = await request.post(`${apiBase}/listings/${listingId}/offers/${offerId}/accept`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  expect(accepted.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

/* No clock movement anywhere in this spec: the loan is listed on the day it
   was drawn, so the cap is exactly the principal, and the spec can share the
   base project with everything else (Q-016). */
test('a lender exits early and another takes the position', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const sellerEmail = `seller-${stamp}@example.test`;
  const buyerEmail = `buyer-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, sellerEmail);
  await registerMember(request, buyerEmail);
  const receiptId = await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, sellerEmail, '250000');
  await fundAccount(request, buyerEmail, '300000');
  await originateLoan(request, borrowerEmail, sellerEmail, receiptId);

  // The seller lists their position from the portfolio.
  await signIn(page, sellerEmail);
  await page.getByRole('link', { name: 'Portfolio' }).click();
  await page.getByTestId('side-lending').click();
  await expect(page.getByTestId('portfolio-open')).toContainText('Earning');
  await page.getByRole('button', { name: 'Sell position' }).click();
  await expect(page.getByTestId('sale-cap')).toContainText('USD 2,500.00');
  await page.getByTestId('ask-input').fill('2400.00');
  await page.getByTestId('sell-submit').click();
  await expect(page.getByTestId('portfolio-open')).toContainText('Listed for sale');
  await expect(page.getByTestId('portfolio-open')).toContainText('Withdraw sale');

  // The buyer scans the items first, and only the item they choose draws.
  await signIn(page, buyerEmail);
  await page.getByRole('link', { name: 'Secondary Market' }).click();
  await expect(page.getByTestId('sale-list')).toBeVisible();
  await expect(page.getByTestId('figure-pay')).toHaveText('USD 2,400.00');
  await expect(page.getByTestId('figure-receive')).toHaveText('USD 2,536.98');
  // 2536.98 back against 2400.00 paid.
  await expect(page.getByTestId('figure-profit')).toContainText('+USD 136.98');
  // All four amounts on one line, at the distances they sit apart, with the
  // two that are not set above it written against their own dots.
  await expect(page.getByTestId('sale-scale-mark-ask')).toBeVisible();
  await expect(page.getByTestId('sale-scale-mark-maturity')).toBeVisible();
  // Listed the day it was drawn, so the principal and today's value are the
  // same figure in the same place, kept apart by sitting on opposite sides.
  await expect(page.getByTestId('sale-scale-value-principal')).toContainText('Principal');
  await expect(page.getByTestId('sale-scale-value-principal')).toContainText('2,500.00');
  await expect(page.getByTestId('sale-scale-value-today')).toContainText('Today');
  await expect(page.getByTestId('sale-chart')).toHaveCount(0);

  await page.getByTestId('sale-row').click();
  await expect(page.getByTestId('sale-detail')).toBeVisible();
  await expect(page.getByTestId('sale-chart')).toBeVisible();
  await expect(page.getByText('Position value')).toBeVisible();
  await expect(page.getByText('Asking price')).toBeVisible();
  await expect(page.getByTestId('sale-chart-marked-label')).toHaveText('Today');
  await page.getByTestId('buy-position').click();
  await page.getByTestId('confirm-purchase').click();
  await expect(page.getByText('The position is yours. Repayment now pays you.')).toBeVisible();

  // The loan now sits on the buyer's lending side.
  await page.getByRole('link', { name: 'Portfolio' }).click();
  await page.getByTestId('side-lending').click();
  await expect(page.getByTestId('portfolio-open')).toContainText('Earning');
  await expect(page.getByTestId('portfolio-open')).toContainText('One kilogram gold bar');

  await page.getByRole('link', { name: 'Wallet' }).click();
  // 3000.00 funded less the 2400.00 paid for the position.
  await expect(page.getByTestId('available-balance')).toHaveText('USD 600.00');

  // The seller's exit landed in their balance.
  await signIn(page, sellerEmail);
  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByTestId('available-balance')).toHaveText('USD 2,400.00');
});

test('an ask above the current value is refused with the cap on screen', async ({
  page,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const sellerEmail = `seller-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, sellerEmail);
  const receiptId = await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, sellerEmail, '250000');
  await originateLoan(request, borrowerEmail, sellerEmail, receiptId);

  await signIn(page, sellerEmail);
  await page.getByRole('link', { name: 'Portfolio' }).click();
  await page.getByTestId('side-lending').click();
  await page.getByRole('button', { name: 'Sell position' }).click();
  await expect(page.getByTestId('sale-cap')).toContainText('USD 2,500.00');
  await page.getByTestId('ask-input').fill('2600.00');
  await page.getByTestId('sell-submit').click();
  await expect(page.getByRole('alert')).toContainText(
    'The ask cannot be more than the position is worth today.',
  );
  // Nothing was listed: the row still offers the sale.
  await expect(page.getByTestId('portfolio-open')).not.toContainText('Listed for sale');
});
