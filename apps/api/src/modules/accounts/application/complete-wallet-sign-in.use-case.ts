import { Inject, Injectable } from '@nestjs/common';
import { Account } from '../../../domain/accounts/account';
import type { Role } from '../../../domain/accounts/account';
import { ACCOUNT_REPOSITORY } from '../../../domain/accounts/account-repository';
import { CUSTODIAN_WALLET_ADDRESSES } from '../../../domain/accounts/custodian-addresses';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
import { PASSWORD_HASHER } from '../../../domain/accounts/password-hasher';
import type { PasswordHasher } from '../../../domain/accounts/password-hasher';
import { Session } from '../../../domain/accounts/session';
import { SESSION_REPOSITORY } from '../../../domain/accounts/session-repository';
import type { SessionRepository } from '../../../domain/accounts/session-repository';
import { SESSION_TOKEN_ISSUER } from '../../../domain/accounts/session-token-issuer';
import type { SessionTokenIssuer } from '../../../domain/accounts/session-token-issuer';
import { WalletChallengeNotFound } from '../../../domain/accounts/wallet-challenge-not-found';
import { WALLET_CHALLENGE_REPOSITORY } from '../../../domain/accounts/wallet-challenge-repository';
import type { WalletChallengeRepository } from '../../../domain/accounts/wallet-challenge-repository';
import { WalletSignatureInvalid } from '../../../domain/accounts/wallet-signature-invalid';
import { WALLET_SIGNATURE_VERIFIER } from '../../../domain/accounts/wallet-signature-verifier';
import type { WalletSignatureVerifier } from '../../../domain/accounts/wallet-signature-verifier';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork, UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { accountIdOf, sessionIdOf } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { SESSION_LIFETIME_MS } from './session-lifetime';

export interface CompleteWalletSignInCommand {
  readonly address: string;
  readonly signature: string;
}

export interface WalletSignInOutcome {
  readonly account: Account;
  readonly sessionToken: string;
  readonly expiresAt: Instant;
}

/* The other half of the challenge: verify the signature over the open nonce,
   spend the nonce so it cannot be replayed, find or create the member the
   address is, and open a session exactly as a password sign in does. */
@Injectable()
export class CompleteWalletSignInUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(WALLET_CHALLENGE_REPOSITORY) private readonly challenges: WalletChallengeRepository,
    @Inject(WALLET_SIGNATURE_VERIFIER) private readonly verifier: WalletSignatureVerifier,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SESSION_TOKEN_ISSUER) private readonly tokenIssuer: SessionTokenIssuer,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(SESSION_LIFETIME_MS) private readonly sessionLifetimeMs: bigint,
    @Inject(CUSTODIAN_WALLET_ADDRESSES) private readonly custodianAddresses: ReadonlySet<string>,
  ) {}

  async execute(
    command: CompleteWalletSignInCommand,
  ): Promise<Result<WalletSignInOutcome, DomainError>> {
    const address = command.address.toLowerCase();
    return this.unitOfWork.run(async (context) => {
      const challenge = await this.challenges.findOpenByAddress(address, context);
      if (challenge === null) {
        return failure(new WalletChallengeNotFound());
      }
      const spent = challenge.spend(this.clock.now());
      if (!spent.ok) {
        return spent;
      }
      const verified = await this.verifier.verifies({
        address,
        message: challenge.message(),
        signature: command.signature,
      });
      if (!verified) {
        return failure(new WalletSignatureInvalid());
      }
      await this.challenges.save(spent.value, context);

      const account = await this.resolveOrCreate(address, context);
      const { token, tokenHash } = this.tokenIssuer.issue();
      const expiresAt = this.clock.now().plusMilliseconds(this.sessionLifetimeMs);
      await this.sessions.save(
        Session.create({
          id: sessionIdOf(this.idGenerator.generate()),
          accountId: account.id,
          tokenHash,
          expiresAt,
        }),
        context,
      );
      return ok({ account, sessionToken: token, expiresAt });
    });
  }

  private async resolveOrCreate(address: string, context: UnitOfWorkContext): Promise<Account> {
    const existing = await this.accounts.findByWalletAddress(address, context);
    if (existing !== null) {
      return existing;
    }
    /* Vault staff for an authorised wallet, a member for any other. A custodian
       is also a member so the same key can hold items and staff the vault. */
    const roles: readonly Role[] = this.custodianAddresses.has(address)
      ? ['MEMBER', 'VAULT_STAFF']
      : ['MEMBER'];
    const account = Account.createForWallet({
      id: accountIdOf(this.idGenerator.generate()),
      address,
      // A real hash of a value nobody holds, so password login can never
      // match a wallet account.
      unusablePasswordHash: await this.passwordHasher.hash(this.idGenerator.generate()),
      roles,
    });
    await this.accounts.save(account, context);
    return account;
  }
}
