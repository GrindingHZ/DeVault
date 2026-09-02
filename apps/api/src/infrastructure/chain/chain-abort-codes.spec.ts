import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { moveAbortCodes } from './chain-abort-codes';

const sources = path.resolve(__dirname, '../../../../../packages/move/sources');

function constantsOf(module: string): Record<string, bigint> {
  const source = readFileSync(path.join(sources, `${module}.move`), 'utf8');
  const constants: Record<string, bigint> = {};
  for (const match of source.matchAll(/^const (E[A-Za-z]+): u64 = (\d+);/gm)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      constants[name] = BigInt(value);
    }
  }
  return constants;
}

/* The map is what turns a chain abort into the domain error the ledger
   would have thrown, so it has to say what the Move sources say. */
describe('moveAbortCodes', () => {
  for (const [module, codes] of Object.entries(moveAbortCodes)) {
    it(`matches the constants in ${module}.move`, () => {
      expect(constantsOf(module)).toEqual(codes);
    });
  }
});
