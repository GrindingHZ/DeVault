import { readFileSync } from 'node:fs';
import path from 'node:path';
import { interestFixtures } from '@depawn/test-support/src/fixtures';
import { renderInterestFixturesModule } from '@depawn/test-support/src/move-fixtures';
import { describe, expect, it } from 'vitest';

/* A fixture added without a regeneration would leave the chain tested
   against fewer cases than the api, which is the disagreement the shared file
   exists to prevent. */
describe('move interest fixtures', () => {
  it('the committed move tests are generated from the current fixture file', () => {
    const committed = readFileSync(
      path.resolve(__dirname, '../../../../../packages/move/tests/interest_fixtures_tests.move'),
      'utf8',
    );
    expect(committed).toBe(renderInterestFixturesModule(interestFixtures));
  });

  it('turns a fixture name into a move test name', () => {
    const rendered = renderInterestFixturesModule([
      {
        name: "truncates in the borrower's favour, always",
        principalMinorUnits: '1',
        annualPercentageRateBasisPoints: 1,
        startedAtMs: '0',
        maturesAtMs: '10',
        nowMs: '5',
        expectedInterestMinorUnits: '0',
      },
    ]);
    expect(rendered).toContain('fun truncates_in_the_borrower_s_favour_always()');
    expect(rendered).toContain('interest::accrued(');
  });
});
