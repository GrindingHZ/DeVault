import type { AccountResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';

export function toAccountResponse(account: Account): AccountResponse {
  return {
    // A wallet account's email field holds its address, which is not an
    // email; the address travels in its own field and the email is null.
    id: account.id,
    email: account.walletAddress === null ? account.email : null,
    walletAddress: account.walletAddress,
    roles: [...account.roles],
  };
}
