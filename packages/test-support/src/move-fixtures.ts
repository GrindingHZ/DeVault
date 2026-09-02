import type { InterestFixture } from './fixtures';

/* Renders the Move test module that checks `depawn::interest::accrued`
   against every case in the shared fixture file. Move tests cannot read a
   file, so the file is turned into source, committed, and a unit test
   asserts the committed copy is current (docs/06-testing.md, Phase 3). */
export function renderInterestFixturesModule(fixtures: readonly InterestFixture[]): string {
  const tests = fixtures.map(
    (fixture) => `#[test]
fun ${testNameOf(fixture.name)}() {
    assert!(
        interest::accrued(
            ${fixture.principalMinorUnits},
            ${fixture.annualPercentageRateBasisPoints},
            ${fixture.startedAtMs},
            ${fixture.maturesAtMs},
            ${fixture.nowMs},
        ) == ${fixture.expectedInterestMinorUnits},
    );
}`,
  );
  return `// Generated from packages/test-support/src/fixtures/interest.json by
// \`pnpm move:fixtures\`. Edit the fixture file, not this one.
#[test_only]
module depawn::interest_fixtures_tests;

use depawn::interest;

${tests.join('\n\n')}
`;
}

function testNameOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
