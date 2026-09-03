import { Transaction } from '@mysten/sui/transactions';
import { describe, expect, it } from 'vitest';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import type { ChainDeployment } from '../../infrastructure/chain/chain-deployment';
import { ChainDeploymentRegistry } from '../../infrastructure/chain/chain-deployment.registry';
import { OperatorSigner } from '../../infrastructure/chain/operator-signer';
import { CustodianReceiptService } from './custodian-receipt.service';

const packageId = `0x${'a'.repeat(64)}`;
const receiptId = `0x${'b'.repeat(64)}`;
const deployment: ChainDeployment = {
  network: 'testnet',
  packageId,
  configId: `0x${'c'.repeat(64)}`,
  adminCapId: `0x${'1'.repeat(64)}`,
  operatorCapId: `0x${'2'.repeat(64)}`,
  custodianCapId: `0x${'3'.repeat(64)}`,
  treasuryCapId: null,
  settlementCoinType: `0x${'d'.repeat(64)}::usdc::USDC`,
  settlementCoinDecimals: 6,
  publishedAt: new Date(0),
  publishedBy: `0x${'0'.repeat(63)}e`,
};

const executed = {
  digest: 'DIGEST',
  events: [],
  effects: { changedObjects: [{ objectId: receiptId, idOperation: 'Created' }] },
  objectTypes: { [receiptId]: `${packageId}::custody::VaultReceipt` },
};

function issueSteps(transaction: Transaction): string[] {
  return transaction.getData().commands.flatMap((command) =>
    command.MoveCall === undefined ? [] : [`${command.MoveCall.module}::${command.MoveCall.function}`],
  );
}

describe('CustodianReceiptService', () => {
  it('operator-signs an issue and returns the created receipt id', async () => {
    let captured: Transaction | null = null;
    const client = {
      core: {
        signAndExecuteTransaction: async (input: { transaction: Transaction }) => {
          captured = input.transaction;
          return { $kind: 'Transaction', Transaction: executed };
        },
      },
      waitForTransaction: async () => undefined,
    } as unknown as ChainClient;
    const registry = { current: () => deployment } as unknown as ChainDeploymentRegistry;
    const operator = { keypair: {} } as unknown as OperatorSigner;
    const service = new CustodianReceiptService(client, operator, registry);

    const result = await service.issue({
      holder: `0x${'e'.repeat(64)}`,
      receiptKey: 'LC-1',
      vault: 'VAULT-1',
      intakeHash: 'sha256:abc',
      appraisedValueBaseUnits: '800000000',
      itemCategory: 'BULLION',
      insuranceReference: 'POL-1',
    });

    expect(result).toEqual({ receiptObjectId: receiptId, digest: 'DIGEST' });
    expect(issueSteps(captured as unknown as Transaction)).toEqual(['custody::issue']);
  });
});
