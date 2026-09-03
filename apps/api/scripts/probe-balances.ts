import { readNetworkEndpoints } from '../src/config/chain-configuration';
import { createReadOnlyChainClient } from '../src/infrastructure/chain/chain-client';

/* Every coin an address holds, so a wallet showing zero can be told apart from
   a wallet holding a different coin than the one the deployment settles in. */
async function main(): Promise<void> {
  const owner = process.argv[2];
  if (owner === undefined) {
    throw new Error('pass an address');
  }
  const client = createReadOnlyChainClient(readNetworkEndpoints());
  const balances = await client.core.listBalances({ owner });
  if (balances.balances.length === 0) {
    process.stdout.write('no coins held\n');
    return;
  }
  for (const balance of balances.balances) {
    process.stdout.write(`${balance.balance}\t${balance.coinType}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
