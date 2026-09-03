import { Transaction } from '@mysten/sui/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChainDeployment } from '../../infrastructure/chain/chain-deployment';
import type { ChainDeploymentRegistry } from '../../infrastructure/chain/chain-deployment.registry';
import type { ChainExecution } from '../../infrastructure/chain/chain-execution';
import type {
  SponsoredTransaction,
  SponsoredTransactionGateway,
} from '../../infrastructure/chain/sponsored-transaction';
import { ChainTransactionService } from './chain-transaction.service';

const packageId = `0x${'a'.repeat(64)}`;
const deployment: ChainDeployment = {
  network: 'testnet',
  packageId,
  configId: `0x${'c'.repeat(64)}`,
  adminCapId: `0x${'1'.repeat(64)}`,
  operatorCapId: `0x${'2'.repeat(64)}`,
  custodianCapId: `0x${'3'.repeat(64)}`,
  treasuryCapId: null,
  settlementCoinType: `${packageId}::usdc::USDC`,
  settlementCoinDecimals: 6,
  publishedAt: new Date(0),
  publishedBy: `0x${'0'.repeat(63)}e`,
};

const member = `0x${'e'.repeat(64)}`;
const object = (seed: string): string =>
  `0x${seed.charCodeAt(0).toString(16).padStart(2, '0').repeat(32)}`;

class RecordingGateway implements SponsoredTransactionGateway {
  member: string | null = null;
  transaction: Transaction | null = null;
  executed: { bytes: string; signature: string } | null = null;

  async build(
    memberAddress: string,
    append: (transaction: Transaction) => void,
  ): Promise<SponsoredTransaction> {
    this.member = memberAddress;
    const transaction = new Transaction();
    append(transaction);
    this.transaction = transaction;
    return { transactionBytes: 'BYTES' };
  }

  async execute(transactionBytes: string, signature: string): Promise<ChainExecution> {
    this.executed = { bytes: transactionBytes, signature };
    return { digest: 'DIGEST', events: [], createdObjectIds: [], objectTypes: {} };
  }
}

function stepsOf(transaction: Transaction): string[] {
  return transaction.getData().commands.map((command) => {
    if (command.MoveCall !== undefined) {
      return `${command.MoveCall.module}::${command.MoveCall.function}`;
    }
    if (command.SplitCoins !== undefined) {
      return 'split';
    }
    return command.$kind;
  });
}

describe('ChainTransactionService', () => {
  let gateway: RecordingGateway;
  let service: ChainTransactionService;

  beforeEach(() => {
    gateway = new RecordingGateway();
    const registry = { current: () => deployment } as unknown as ChainDeploymentRegistry;
    service = new ChainTransactionService(registry, gateway);
  });

  it('builds open, cancel, accept, repay, collect and claim against the member', async () => {
    await service.openPledge(member, {
      receiptObjectId: object('r'),
      requestedPrincipalBaseUnits: '400000',
      requestedAprBps: 3600,
    });
    expect(gateway.member).toBe(member);
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['pledge::open']);

    await service.acceptOffer(member, {
      pledgeObjectId: object('p'),
      holdObjectId: object('h'),
      termMs: 2_592_000_000,
    });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['pledge::accept']);

    await service.repay(member, {
      pledgeObjectId: object('p'),
      borrowerNoteObjectId: object('b'),
      coinObjectId: object('9'),
    });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['pledge::repay']);

    await service.collect(member, { pledgeObjectId: object('p'), lenderNoteObjectId: object('l') });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['pledge::collect']);

    await service.claimDefault(member, {
      pledgeObjectId: object('p'),
      lenderNoteObjectId: object('l'),
    });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['pledge::claim_default']);
  });

  it('splits the coin before an offer and a purchase', async () => {
    await service.makeOffer(member, {
      pledgeObjectId: object('p'),
      holdKey: 'HOLD-1',
      coinObjectId: object('9'),
      amountBaseUnits: '400000',
      aprBps: 1800,
      expiresAtMs: 1_800_000_000_000,
    });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['split', 'pledge::offer']);

    await service.buyPosition(member, {
      listingObjectId: object('7'),
      coinObjectId: object('9'),
      askBaseUnits: '410000',
    });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['split', 'market::buy_position']);
  });

  it('redeems and trades positions', async () => {
    await service.redeem(member, { receiptObjectId: object('r') });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['custody::redeem']);

    await service.listPosition(member, { lenderNoteObjectId: object('l'), askBaseUnits: '410000' });
    expect(stepsOf(gateway.transaction as Transaction)).toEqual(['market::list_position']);
  });

  it('passes the bytes and signature straight to the gateway on execute', async () => {
    const execution = await service.execute('BYTES', 'SIG');
    expect(gateway.executed).toEqual({ bytes: 'BYTES', signature: 'SIG' });
    expect(execution.digest).toBe('DIGEST');
  });
});
