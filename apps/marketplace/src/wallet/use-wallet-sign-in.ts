import { beginWalletSignIn, completeWalletSignIn } from '@depawn/contracts';
import {
  useConnectWallet,
  useCurrentAccount,
  useSignPersonalMessage,
  useWallets,
} from '@mysten/dapp-kit';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { testKeypair } from './test-wallet';

async function signInWithKeypair(keypair: Ed25519Keypair): Promise<void> {
  const address = keypair.toSuiAddress();
  const challenge = await beginWalletSignIn({ address });
  const { signature } = await keypair.signPersonalMessage(
    new TextEncoder().encode(challenge.message),
  );
  await completeWalletSignIn({ address, signature });
}

/* Signs the challenge and lands a session cookie. The test wallet signs in
   the app; a real wallet connects through dapp-kit, then signs the same
   challenge with the connected account. */
export function useWalletSignIn(options: { onSuccess: () => Promise<void> | void }): {
  readonly isTestWallet: boolean;
  readonly mutation: UseMutationResult<void, unknown, void>;
} {
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: connect } = useConnectWallet();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const mutation = useMutation<void, unknown, void>({
    mutationFn: async () => {
      if (testKeypair !== null) {
        await signInWithKeypair(testKeypair);
        return;
      }
      let account = currentAccount;
      if (account === null) {
        const wallet = wallets[0];
        if (wallet === undefined) {
          throw new Error('No wallet is available to sign in with.');
        }
        const connected = await connect({ wallet });
        account = connected.accounts[0] ?? null;
      }
      if (account === null) {
        throw new Error('The wallet did not share an account.');
      }
      const address = account.address;
      const challenge = await beginWalletSignIn({ address });
      /* Sign on whatever chain the wallet already holds this account on.
         Proving control of the key is the same on every Sui network, and the
         address is identical across them, so the sign in must not depend on
         which network the app settles against. Left unset, dapp-kit forces
         `sui:${defaultNetwork}` and a wallet on any other network rejects it. */
      const message = new TextEncoder().encode(challenge.message);
      const chain = account.chains[0];
      const { signature } = await signPersonalMessage(
        chain === undefined ? { message, account } : { message, account, chain },
      );
      await completeWalletSignIn({ address, signature });
    },
    onSuccess: options.onSuccess,
  });

  return { isTestWallet: testKeypair !== null, mutation };
}
