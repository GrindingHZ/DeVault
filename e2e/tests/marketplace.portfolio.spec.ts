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

/* Seed through the API, assert through the UI (docs/06-testing.md). */
async function issueReceiptFor(
  request: APIRequestContext,
  borrowerEmail: string,
  itemDescription: string,
): Promise<string> {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'staff@demo.test', password: 'demo-password-123' },
  });
  const begun = await request.post(`${apiBase}/vaults/VAULT-DEMO-1/intakes`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { borrowerEmail, itemCategory: 'BULLION', itemDescription },
  });
  expect(begun.status()).toBe(201);
  const intakeId = ((await begun.json()) as { id: string }).id;

  await request.patch(`${apiBase}/intakes/${intakeId}`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { sealNumber: `SEAL-${randomUUID().slice(0, 8)}` },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/photos`, {
    multipart: {
      photo: { name: 'front.jpg', mimeType: 'image/jpeg', buffer: photographBytes() },
    },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/appraisals`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      value: { minorUnits: '500000', currency: 'AUD' },
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
    data: { email, amount: { minorUnits, currency: 'AUD' } },
  });
  expect(deposit.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
}

async function publishListing(
  request: APIRequestContext,
  borrowerEmail: string,
  receiptId: string,
): Promise<string> {
  await request.post(`${apiBase}/auth/login`, { data: { email: borrowerEmail, password } });
  const listing = await request.post(`${apiBase}/listings`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      receiptId,
      requestedPrincipal: { minorUnits: '250000', currency: 'AUD' },
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
  await request.post(`${apiBase}/auth/logout`);
  return listingId;
}

async function offerOn(
  request: APIRequestContext,
  lenderEmail: string,
  listingId: string,
  basisPoints: number,
): Promise<void> {
  await request.post(`${apiBase}/auth/login`, { data: { email: lenderEmail, password } });
  const offer = await request.post(`${apiBase}/listings/${listingId}/offers`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      principal: { minorUnits: '250000', currency: 'AUD' },
      annualPercentageRateBasisPoints: basisPoints,
      durationMs: 30 * oneDay,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  expect(offer.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

/* The four screens the portfolio replaced. Every link already written, every
   bookmark and the demo runbook still resolve, and each lands on the side it
   used to be. */
const oldPaths = [
  { path: '/borrow/listings', side: 'borrowing' },
  { path: '/borrow/loans', side: 'borrowing' },
  { path: '/lend/offers', side: 'lending' },
  { path: '/lend/loans', side: 'lending' },
] as const;

test('the old role split paths land on the portfolio with the right side selected', async ({
  page,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `member-${stamp}@example.test`;
  await registerMember(request, email);
  await signIn(page, email);

  for (const { path, side } of oldPaths) {
    await page.goto(path);
    await page.waitForURL(`**/portfolio?side=${side}`);
    await expect(page.getByTestId(`side-${side}`)).toHaveAttribute('aria-selected', 'true');
  }
});

test('a lender reclaims an outbid hold from the attention band', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const loserEmail = `loser-${stamp}@example.test`;
  const winnerEmail = `winner-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, loserEmail);
  await registerMember(request, winnerEmail);
  await fundAccount(request, loserEmail, '300000');
  await fundAccount(request, winnerEmail, '300000');

  const receiptId = await issueReceiptFor(request, borrowerEmail, 'One kilogram gold bar');
  const listingId = await publishListing(request, borrowerEmail, receiptId);
  await offerOn(request, loserEmail, listingId, 2400);
  /* Undercutting supersedes the first hold. Refunds are pull and not push
     (docs/10-flows.md flow 9), so that money sits there earning nothing
     until somebody asks for it back. Nobody used to find it. */
  await offerOn(request, winnerEmail, listingId, 1800);

  await signIn(page, loserEmail);
  await page.getByRole('link', { name: 'Portfolio' }).click();

  await expect(page.getByTestId('total-attention')).toHaveText('1');
  const band = page.getByTestId('attention-band');
  await expect(band).toContainText('One kilogram gold bar');
  await expect(band).toContainText('Outbid');
  await expect(band).toContainText('AUD 2,500.00');

  await band.getByRole('button', { name: 'Reclaim funds' }).click();
  /* The band empties itself. A screen that is quiet most days should look
     quiet, so it renders nothing at all rather than an empty box. */
  await expect(page.getByTestId('attention-band')).toHaveCount(0);
  await expect(page.getByTestId('total-attention')).toHaveText('0');

  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByTestId('available-balance')).toHaveText('AUD 3,000.00');
});

test('one screen shows both sides and the tab never changes the totals', async ({
  page,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const bothEmail = `both-${stamp}@example.test`;
  const otherEmail = `other-${stamp}@example.test`;
  await registerMember(request, bothEmail);
  await registerMember(request, otherEmail);
  await fundAccount(request, bothEmail, '300000');

  /* One account that borrows and lends, which is the case the four old
     screens handled worst: the picture was split across two sections and
     the reader had to assemble it. */
  const ownReceipt = await issueReceiptFor(request, bothEmail, 'Rolex Submariner 116610LN');
  await publishListing(request, bothEmail, ownReceipt);
  const otherReceipt = await issueReceiptFor(request, otherEmail, 'One kilogram gold bar');
  const otherListing = await publishListing(request, otherEmail, otherReceipt);
  await offerOn(request, bothEmail, otherListing, 1800);

  await signIn(page, bothEmail);
  await page.goto('/portfolio');

  const table = page.getByTestId('my-listings');
  await expect(table).toContainText('Rolex Submariner 116610LN');
  await expect(table).toContainText('One kilogram gold bar');

  await page.getByTestId('side-borrowing').click();
  await expect(table).toContainText('Rolex Submariner 116610LN');
  await expect(table).not.toContainText('One kilogram gold bar');
  /* The strip is not filtered. A reader on one side still wants to know
     where they stand on the other. */
  await expect(page.getByTestId('total-lent')).toBeVisible();

  await page.getByTestId('side-lending').click();
  await expect(table).toContainText('One kilogram gold bar');
  await expect(table).not.toContainText('Rolex Submariner 116610LN');

  /* The selection is in the URL, so a reload restores the same view and the
     link is something a person can send. */
  await page.reload();
  await expect(page.getByTestId('side-lending')).toHaveAttribute('aria-selected', 'true');
  await expect(table).toContainText('One kilogram gold bar');
});
