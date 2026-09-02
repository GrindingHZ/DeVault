import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { interestFixtures } from '@depawn/test-support/src/fixtures';
import { renderInterestFixturesModule } from '@depawn/test-support/src/move-fixtures';

const target = path.resolve(__dirname, '../../../packages/move/tests/interest_fixtures_tests.move');
writeFileSync(target, renderInterestFixturesModule(interestFixtures));
process.stdout.write(`wrote ${interestFixtures.length} fixture tests to ${target}\n`);
