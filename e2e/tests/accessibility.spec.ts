import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* P8 asks for axe green on the primary routes. Serious and critical only:
   the lower two severities are largely advisory and a suite that fails on
   them gets muted, which is worse than not having it.

   Every route names something that only exists once the screen has really
   rendered, and that is asserted before the scan. Without it a route that
   silently failed to load would report no violations, because empty markup
   cannot violate anything, and the suite would call that a pass. */

const marketplaceBase = 'http://localhost:5273';
const vaultConsoleBase = 'http://localhost:5174';
const adminBase = 'http://localhost:5175';
const staffPassword = 'demo-password-123';

async function signIn(page: Page, email: string): Promise<void> {
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(staffPassword);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

async function expectNoSeriousViolations(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  // Named rather than counted, so a failure says which rule, and where.
  expect(
    serious.map(
      (violation) => `${where} ${violation.id}: ${violation.nodes.map((n) => n.target).join(' ')}`,
    ),
  ).toEqual([]);
}

interface Route {
  readonly path: string;
  /* Something only the real screen renders. The scan does not run until it
     is on the page. */
  readonly proof: string;
}

const apps = [
  {
    app: 'marketplace',
    base: marketplaceBase,
    email: 'member@demo.test',
    routes: [
      { path: '/listings', proof: 'browse-table' },
      { path: '/borrow/receipts', proof: 'my-receipts' },
      { path: '/borrow/listings', proof: 'my-listings' },
      { path: '/borrow/loans', proof: 'my-loans' },
      { path: '/lend/offers', proof: 'my-offers' },
      { path: '/wallet', proof: 'available-balance' },
    ] as readonly Route[],
  },
  {
    app: 'vault console',
    base: vaultConsoleBase,
    email: 'staff@demo.test',
    routes: [
      { path: '/intake', proof: 'intake-start' },
      { path: '/inventory', proof: 'inventory-table' },
      { path: '/releases', proof: 'release-queue' },
      { path: '/exposure', proof: 'exposure-current' },
    ] as readonly Route[],
  },
  {
    app: 'admin',
    base: adminBase,
    email: 'ops@demo.test',
    routes: [
      { path: '/operations', proof: 'system-state' },
      { path: '/parameters', proof: 'current-parameters' },
      { path: '/reconciliation', proof: 'loan-book' },
      { path: '/liquidations', proof: 'liquidations-table' },
      { path: '/deposits', proof: 'deposit-submit' },
    ] as readonly Route[],
  },
] as const;

/* The responsive work is asserted by nobody unless the pass runs at more
   than one width. These three are a laptop, a small laptop and a tablet in
   portrait, which is where the tables stop fitting. */
const widths = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '1024', viewport: { width: 1024, height: 768 } },
  { name: '768', viewport: { width: 768, height: 1024 } },
] as const;

for (const entry of apps) {
  test(`the ${entry.app} login screen is free of serious accessibility faults`, async ({
    page,
  }) => {
    await page.goto(`${entry.base}/login`);
    await expect(page.getByTestId('login-submit')).toBeVisible();
    await expectNoSeriousViolations(page, `${entry.app} /login`);
  });

  test(`the ${entry.app} primary routes are free of serious accessibility faults`, async ({
    page,
  }) => {
    await page.goto(`${entry.base}/login`);
    await signIn(page, entry.email);
    await expectNoSeriousViolations(page, `${entry.app} /`);

    for (const route of entry.routes) {
      await page.goto(`${entry.base}${route.path}`);
      await expect(page.getByTestId(route.proof)).toBeVisible();
      await expectNoSeriousViolations(page, `${entry.app} ${route.path}`);
    }
  });

  test(`the ${entry.app} holds together at every width`, async ({ page }) => {
    await page.goto(`${entry.base}/login`);
    await signIn(page, entry.email);

    for (const width of widths) {
      await page.setViewportSize(width.viewport);
      for (const route of entry.routes) {
        await page.goto(`${entry.base}${route.path}`);
        await expect(page.getByTestId(route.proof)).toBeVisible();

        /* The defect this guards: a table wider than its container used to
           push the page sideways, so the whole document scrolled. A pane may
           scroll horizontally; the document may not. */
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        expect(overflows, `${entry.app} ${route.path} at ${width.name} scrolls sideways`).toBe(
          false,
        );
      }
    }
  });
}

/* An identifier may be a secondary reference. It may never be the only thing
   naming a person, which is what the audit trail and the inventory did. */
test('the screens that name people do not answer with an identifier', async ({ page }) => {
  await page.goto(`${adminBase}/login`);
  await signIn(page, 'ops@demo.test');
  await page.goto(`${adminBase}/operations`);
  await expect(page.getByTestId('audit-table')).toBeVisible();
  await expect(page.getByTestId('audit-table')).toContainText('@');
});

/* The workspace with nothing selected is only half of it. The offer book,
   the rate chart and the spine only exist once a listing is chosen, and they
   are the densest markup in the product, so they are scanned separately
   rather than left to a route list that can never reach them. */
test('the selected listing panes are free of serious accessibility faults', async ({ page }) => {
  await page.goto(`${marketplaceBase}/login`);
  await signIn(page, 'member@demo.test');
  await page.goto(`${marketplaceBase}/listings`);
  await expect(page.getByTestId('browse-table')).toBeVisible();

  await page.getByTestId('browse-table').getByRole('button').first().click();
  // The selection lands in the URL, which is what every pane reads.
  await expect(page).toHaveURL(/listing=/);
  await expect(page.getByTestId('offer-book')).toBeVisible();
  await expectNoSeriousViolations(page, 'marketplace /listings with a selection');

  // The gallery is different markup over the same data, so it gets its own
  // scan rather than being assumed equivalent to the rows.
  await page.getByTestId('browse-density').selectOption('gallery');
  await expect(page.getByTestId('browse-table')).toBeVisible();
  await expectNoSeriousViolations(page, 'marketplace /listings as a gallery');
});
