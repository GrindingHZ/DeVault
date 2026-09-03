import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { WalletChallenge } from './wallet-challenge';

export interface WalletChallengeRepository {
  save(challenge: WalletChallenge, context: UnitOfWorkContext): Promise<void>;
  findOpenByAddress(address: string, context: UnitOfWorkContext): Promise<WalletChallenge | null>;
}

export const WALLET_CHALLENGE_REPOSITORY = Symbol('WalletChallengeRepository');
