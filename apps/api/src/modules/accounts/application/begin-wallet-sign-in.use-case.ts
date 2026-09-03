import { Inject, Injectable } from '@nestjs/common';
import { WalletChallenge } from '../../../domain/accounts/wallet-challenge';
import { WALLET_CHALLENGE_REPOSITORY } from '../../../domain/accounts/wallet-challenge-repository';
import type { WalletChallengeRepository } from '../../../domain/accounts/wallet-challenge-repository';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { accountIdOf } from '../../../domain/shared/identifiers';

export interface BeginWalletSignInCommand {
  readonly address: string;
}

export interface WalletChallengeIssued {
  readonly message: string;
  readonly expiresAt: bigint;
}

/* Five minutes is long enough to move from the button to the wallet popup
   and back, short enough that a leaked nonce is worthless by the time anyone
   finds it. */
const challengeLifetimeMs = 5n * 60n * 1000n;

@Injectable()
export class BeginWalletSignInUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(WALLET_CHALLENGE_REPOSITORY) private readonly challenges: WalletChallengeRepository,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: BeginWalletSignInCommand): Promise<WalletChallengeIssued> {
    return this.unitOfWork.run(async (context) => {
      const expiresAt = this.clock.now().plusMilliseconds(challengeLifetimeMs);
      const challenge = WalletChallenge.issue({
        id: accountIdOf(this.idGenerator.generate()),
        nonce: this.idGenerator.generate(),
        address: command.address,
        expiresAt,
      });
      await this.challenges.save(challenge, context);
      return { message: challenge.message(), expiresAt: expiresAt.epochMilliseconds };
    });
  }
}
