import { Injectable } from '@nestjs/common';
import { WalletChallenge } from '../../../domain/accounts/wallet-challenge';
import type { WalletChallengeRepository } from '../../../domain/accounts/wallet-challenge-repository';
import { accountIdOf } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import { transactionOf } from '../prisma-unit-of-work';

@Injectable()
export class PrismaWalletChallengeRepository implements WalletChallengeRepository {
  async save(challenge: WalletChallenge, context: UnitOfWorkContext): Promise<void> {
    const data = {
      nonce: challenge.nonce,
      address: challenge.address,
      expiresAt: new Date(Number(challenge.expiresAt.epochMilliseconds)),
      usedAt:
        challenge.usedAt === null ? null : new Date(Number(challenge.usedAt.epochMilliseconds)),
    };
    await transactionOf(context).walletChallenge.upsert({
      where: { id: challenge.id },
      update: data,
      create: { id: challenge.id, ...data },
    });
  }

  /* The newest unused challenge for the address, which is the one a verify
     is answering. */
  async findOpenByAddress(
    address: string,
    context: UnitOfWorkContext,
  ): Promise<WalletChallenge | null> {
    const row = await transactionOf(context).walletChallenge.findFirst({
      where: { address: address.toLowerCase(), usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (row === null) {
      return null;
    }
    return WalletChallenge.restore({
      id: accountIdOf(row.id),
      nonce: row.nonce,
      address: row.address,
      expiresAt: Instant.fromEpochMilliseconds(BigInt(row.expiresAt.getTime())),
      usedAt:
        row.usedAt === null ? null : Instant.fromEpochMilliseconds(BigInt(row.usedAt.getTime())),
    });
  }
}
