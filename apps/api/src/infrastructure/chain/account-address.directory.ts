import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { ChainConfiguration } from '../../config/chain-configuration';
import { platformPurposeOf } from '../../domain/ledger/platform-accounts';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { accountIdOf } from '../../domain/shared/identifiers';
import type { AccountId } from '../../domain/shared/identifiers';
import { transactionOf } from '../persistence/prisma-unit-of-work';
import { CHAIN_CONFIGURATION } from './chain.tokens';
import { OperatorSigner } from './operator-signer';

export type AddressSource = 'DERIVED' | 'WALLET';

/* The address for an account that never signed in with a wallet: one seed,
   one account id, always the same address, so a fresh process answers the
   same question the same way and no key is ever stored. */
export function deriveAccountAddress(accountSeedHex: string, accountId: AccountId): string {
  const seed = createHmac('sha256', Buffer.from(accountSeedHex, 'hex')).update(accountId).digest();
  return Ed25519Keypair.deriveKeypairFromSeed(new Uint8Array(seed)).toSuiAddress();
}

/* Maps the api's account ids onto addresses. The platform sentinels are the
   operator: the fee, the rounding, and the float are all its wallet. */
@Injectable()
export class AccountAddressDirectory {
  constructor(
    @Inject(CHAIN_CONFIGURATION) private readonly configuration: ChainConfiguration,
    private readonly signer: OperatorSigner,
  ) {}

  async resolve(accountId: AccountId, context: UnitOfWorkContext): Promise<string> {
    if (platformPurposeOf(accountId) !== null) {
      return this.signer.address;
    }
    const transaction = transactionOf(context);
    const existing = await transaction.chainAccountAddress.findUnique({ where: { accountId } });
    if (existing !== null) {
      return existing.address;
    }
    const address = deriveAccountAddress(this.configuration.accountSeed, accountId);
    // Two first uses in flight resolve to the same derived address, so the
    // loser of the insert race is harmless.
    await transaction.chainAccountAddress.createMany({
      data: [{ accountId, address, source: 'DERIVED' }],
      skipDuplicates: true,
    });
    return address;
  }

  /* A wallet that signed in owns the account from now on: withdrawals land
     there, and a wallet object opened later names it as the owner. */
  async link(accountId: AccountId, address: string, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).chainAccountAddress.upsert({
      where: { accountId },
      update: { address, source: 'WALLET' },
      create: { accountId, address, source: 'WALLET' },
    });
  }

  async findAccountByAddress(
    address: string,
    context: UnitOfWorkContext,
  ): Promise<AccountId | null> {
    const row = await transactionOf(context).chainAccountAddress.findUnique({ where: { address } });
    return row === null ? null : accountIdOf(row.accountId);
  }
}
