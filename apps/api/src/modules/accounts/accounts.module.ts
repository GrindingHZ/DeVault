import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ACCOUNT_REPOSITORY } from '../../domain/accounts/account-repository';
import { PASSWORD_HASHER } from '../../domain/accounts/password-hasher';
import { SESSION_REPOSITORY } from '../../domain/accounts/session-repository';
import { SESSION_TOKEN_ISSUER } from '../../domain/accounts/session-token-issuer';
import { WALLET_CHALLENGE_REPOSITORY } from '../../domain/accounts/wallet-challenge-repository';
import { WALLET_SIGNATURE_VERIFIER } from '../../domain/accounts/wallet-signature-verifier';
import { CUSTODIAN_WALLET_ADDRESSES } from '../../domain/accounts/custodian-addresses';
import { loadConfiguration } from '../../config/configuration';
import { readNetworkEndpoints } from '../../config/chain-configuration';
import { createReadOnlyChainClient } from '../../infrastructure/chain/chain-client';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import { UlidIdGeneratorAdapter } from '../../infrastructure/id/ulid-id-generator.adapter';
import { PrismaAccountRepository } from '../../infrastructure/persistence/repositories/prisma-account.repository';
import { PrismaSessionRepository } from '../../infrastructure/persistence/repositories/prisma-session.repository';
import { PrismaWalletChallengeRepository } from '../../infrastructure/persistence/repositories/prisma-wallet-challenge.repository';
import { SuiWalletSignatureVerifier } from '../../infrastructure/security/sui-wallet-signature-verifier.adapter';
import { Argon2PasswordHasherAdapter } from '../../infrastructure/security/argon2-password-hasher.adapter';
import { CryptoSessionTokenIssuerAdapter } from '../../infrastructure/security/crypto-session-token-issuer.adapter';
import { BeginWalletSignInUseCase } from './application/begin-wallet-sign-in.use-case';
import { CompleteWalletSignInUseCase } from './application/complete-wallet-sign-in.use-case';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { RegisterAccountUseCase } from './application/register-account.use-case';
import { ResolveSessionUseCase } from './application/resolve-session.use-case';
import { SESSION_LIFETIME_MS, defaultSessionLifetimeMs } from './application/session-lifetime';
import { AuthController } from './http/auth.controller';
import { AuthGuard } from './http/auth.guard';
import { MeController } from './http/me.controller';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    RegisterAccountUseCase,
    LoginUseCase,
    BeginWalletSignInUseCase,
    CompleteWalletSignInUseCase,
    LogoutUseCase,
    ResolveSessionUseCase,
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasherAdapter },
    { provide: SESSION_TOKEN_ISSUER, useClass: CryptoSessionTokenIssuerAdapter },
    { provide: WALLET_CHALLENGE_REPOSITORY, useClass: PrismaWalletChallengeRepository },
    {
      /* Its own read-only client, so a zkLogin sign in can be verified whether
         or not the settlement chain driver is on, and without the operator
         key. */
      provide: WALLET_SIGNATURE_VERIFIER,
      useFactory: (): SuiWalletSignatureVerifier =>
        new SuiWalletSignatureVerifier(createReadOnlyChainClient(readNetworkEndpoints())),
    },
    { provide: ID_GENERATOR, useClass: UlidIdGeneratorAdapter },
    {
      provide: CUSTODIAN_WALLET_ADDRESSES,
      useFactory: (): ReadonlySet<string> => new Set(loadConfiguration().custodianWalletAddresses),
    },
    { provide: SESSION_LIFETIME_MS, useValue: defaultSessionLifetimeMs },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [ResolveSessionUseCase],
})
export class AccountsModule {}
