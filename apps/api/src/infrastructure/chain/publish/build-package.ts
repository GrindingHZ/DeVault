import { execFileSync } from 'node:child_process';
import path from 'node:path';

export interface CompiledPackage {
  readonly modules: readonly string[];
  readonly dependencies: readonly string[];
}

/* Compiles packages/move with the sui binary and answers the bytecode the
   publish command takes. The binary, not a bundled compiler, so the bytes
   published are the bytes `pnpm move:test` proved. */
export function buildPackage(repositoryRoot: string): CompiledPackage {
  const output = execFileSync(
    'sui',
    [
      'move',
      'build',
      '--dump-bytecode-as-base64',
      '--path',
      path.join(repositoryRoot, 'packages', 'move'),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
  );
  const parsed: unknown = JSON.parse(output.slice(output.indexOf('{')));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('modules' in parsed) ||
    !('dependencies' in parsed) ||
    !Array.isArray(parsed.modules) ||
    !Array.isArray(parsed.dependencies)
  ) {
    throw new Error('sui move build did not answer with modules and dependencies');
  }
  return {
    modules: parsed.modules.filter((value): value is string => typeof value === 'string'),
    dependencies: parsed.dependencies.filter((value): value is string => typeof value === 'string'),
  };
}
