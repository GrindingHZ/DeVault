import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

/* Signing in with a wallet, proven by a real keypair signing the challenge
   the way Slush would. No node is needed: the signature carries the public
   key, and the address is derived from it. */
describe('wallet sign in', () => {
  let harness: TestApplication;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  afterEach(async () => {
    await harness.truncateAllTables();
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function signIn(
    keypair: Ed25519Keypair,
  ): Promise<{ cookies: string[]; accountId: string }> {
    const address = keypair.toSuiAddress();
    const challenge = await server()
      .post('/api/v1/auth/wallet/challenge')
      .send({ address })
      .expect(200);
    const { signature } = await keypair.signPersonalMessage(
      new TextEncoder().encode(challenge.body.message),
    );
    const verify = await server()
      .post('/api/v1/auth/wallet/verify')
      .send({ address, signature })
      .expect(200);
    return { cookies: verify.get('Set-Cookie') ?? [], accountId: verify.body.id };
  }

  it('creates a member for a new wallet and resolves its session', async () => {
    const keypair = new Ed25519Keypair();
    const { cookies, accountId } = await signIn(keypair);

    const me = await server().get('/api/v1/me').set('Cookie', cookies).expect(200);
    expect(me.body.id).toBe(accountId);
    const account = await harness.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.walletAddress).toBe(keypair.toSuiAddress().toLowerCase());
    expect(account.roles).toEqual(['MEMBER']);
  });

  it('returns the same account when the same wallet signs in again', async () => {
    const keypair = new Ed25519Keypair();
    const first = await signIn(keypair);
    const second = await signIn(keypair);
    expect(second.accountId).toBe(first.accountId);
    expect(await harness.prisma.account.count()).toBe(1);
  });

  it('refuses a signature from a different key', async () => {
    const address = new Ed25519Keypair().toSuiAddress();
    const challenge = await server()
      .post('/api/v1/auth/wallet/challenge')
      .send({ address })
      .expect(200);
    const impostor = new Ed25519Keypair();
    const { signature } = await impostor.signPersonalMessage(
      new TextEncoder().encode(challenge.body.message),
    );
    const rejected = await server()
      .post('/api/v1/auth/wallet/verify')
      .send({ address, signature })
      .expect(401);
    expect(rejected.body.error.code).toBe('WALLET_SIGNATURE_INVALID');
    expect(await harness.prisma.account.count()).toBe(0);
  });

  it('refuses a replay of a spent challenge', async () => {
    const keypair = new Ed25519Keypair();
    const address = keypair.toSuiAddress();
    const challenge = await server()
      .post('/api/v1/auth/wallet/challenge')
      .send({ address })
      .expect(200);
    const { signature } = await keypair.signPersonalMessage(
      new TextEncoder().encode(challenge.body.message),
    );
    await server().post('/api/v1/auth/wallet/verify').send({ address, signature }).expect(200);
    const replay = await server()
      .post('/api/v1/auth/wallet/verify')
      .send({ address, signature })
      .expect(401);
    expect(replay.body.error.code).toBe('WALLET_CHALLENGE_NOT_FOUND');
  });
});
