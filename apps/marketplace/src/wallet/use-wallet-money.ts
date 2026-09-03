import { fetchChainDeployment } from '@depawn/contracts';
import { useSuiClientQuery } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '../current-account';
import { notePledgeId, pledgeTermsFrom, receiptSummaryFrom } from './chain-objects';
import type { ReceiptSummary } from './chain-objects';
import { borrowerStanding, lenderStanding, summarizeWallet } from './wallet-money';
import type { BorrowerStanding, LenderStanding, PledgeTerms, WalletTotals } from './wallet-money';

/* The whole of a member's money, read straight from a full node. The deployment
   names the coin and the package that types the notes and receipts; the wallet
   address comes from the session, not the connected wallet, so the figures load
   on a reload before a wallet reconnects. Only the standing offers are missing,
   because a FundsHold is shared and cannot be found by owner without the indexer
   (docs/superpowers/specs/2026-08-26-wallet-self-custody-design.md). */
export interface WalletMoney {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly hasWallet: boolean;
  readonly decimals: number;
  readonly availableBaseUnits: bigint;
  readonly lender: readonly LenderStanding[];
  readonly borrower: readonly BorrowerStanding[];
  readonly receipts: readonly ReceiptSummary[];
  readonly totals: WalletTotals;
}

/* Only the shape the parsers read, so this does not couple to a client type
   name that moves between sdk versions. */
interface OwnedObject {
  readonly data?: { readonly objectId?: string; readonly content?: unknown } | null;
}

/* Just the free balance, for the header pill, so a screen that only shows the
   one number does not fire the owned-object reads the full wallet needs. */
export function useAvailableUsdc(): {
  readonly isReady: boolean;
  readonly decimals: number;
  readonly availableBaseUnits: bigint;
} {
  const account = useCurrentAccount();
  const address = account.data?.walletAddress ?? null;
  const deployment = useQuery({
    queryKey: ['chain-deployment'],
    queryFn: fetchChainDeployment,
    staleTime: Infinity,
  });
  const coinType = deployment.data?.settlementCoinType ?? null;
  const decimals = deployment.data?.settlementCoinDecimals ?? 6;
  const ready = address !== null && coinType !== null;
  const balance = useSuiClientQuery(
    'getBalance',
    { owner: address ?? '', coinType: coinType ?? '' },
    { enabled: ready },
  );
  return {
    isReady: ready && balance.data !== undefined,
    decimals,
    availableBaseUnits: BigInt(balance.data?.totalBalance ?? '0'),
  };
}

function pledgeIdsOf(objects: readonly OwnedObject[]): string[] {
  return objects
    .map((object) => notePledgeId(object.data?.content))
    .filter((id): id is string => id !== null);
}

function pledgeTermsById(objects: readonly OwnedObject[]): Map<string, PledgeTerms> {
  const terms = new Map<string, PledgeTerms>();
  for (const object of objects) {
    const objectId = object.data?.objectId;
    if (objectId === undefined) {
      continue;
    }
    const parsed = pledgeTermsFrom(objectId, object.data?.content);
    if (parsed !== null) {
      terms.set(objectId, parsed);
    }
  }
  return terms;
}

function receiptsOf(objects: readonly OwnedObject[]): ReceiptSummary[] {
  return objects
    .map((object) =>
      object.data?.objectId === undefined
        ? null
        : receiptSummaryFrom(object.data.objectId, object.data.content),
    )
    .filter((summary): summary is ReceiptSummary => summary !== null);
}

const ownedNoteQuery = (owner: string, structType: string) => ({
  owner,
  filter: { StructType: structType },
  options: { showContent: true },
});

export function useWalletMoney(nowMs: number): WalletMoney {
  const account = useCurrentAccount();
  const address = account.data?.walletAddress ?? null;

  const deployment = useQuery({
    queryKey: ['chain-deployment'],
    queryFn: fetchChainDeployment,
    staleTime: Infinity,
  });
  const packageId = deployment.data?.packageId ?? null;
  const coinType = deployment.data?.settlementCoinType ?? null;
  const decimals = deployment.data?.settlementCoinDecimals ?? 6;
  const ready = address !== null && packageId !== null && coinType !== null;

  const balance = useSuiClientQuery(
    'getBalance',
    { owner: address ?? '', coinType: coinType ?? '' },
    { enabled: ready },
  );
  const lenderNotes = useSuiClientQuery(
    'getOwnedObjects',
    ownedNoteQuery(address ?? '', `${packageId}::notes::LenderNote`),
    { enabled: ready },
  );
  const borrowerNotes = useSuiClientQuery(
    'getOwnedObjects',
    ownedNoteQuery(address ?? '', `${packageId}::notes::BorrowerNote`),
    { enabled: ready },
  );
  const receiptObjects = useSuiClientQuery(
    'getOwnedObjects',
    ownedNoteQuery(address ?? '', `${packageId}::custody::VaultReceipt`),
    { enabled: ready },
  );

  const lenderPledgeIds = pledgeIdsOf(lenderNotes.data?.data ?? []);
  const borrowerPledgeIds = pledgeIdsOf(borrowerNotes.data?.data ?? []);
  const pledgeIds = [...new Set([...lenderPledgeIds, ...borrowerPledgeIds])];

  const pledges = useSuiClientQuery(
    'multiGetObjects',
    { ids: pledgeIds, options: { showContent: true } },
    { enabled: pledgeIds.length > 0 },
  );

  const termsById = pledgeTermsById(pledges.data ?? []);
  const lender = lenderPledgeIds
    .map((id) => termsById.get(id))
    .filter((terms): terms is PledgeTerms => terms !== undefined)
    .map((terms) => lenderStanding(terms, nowMs));
  const borrower = borrowerPledgeIds
    .map((id) => termsById.get(id))
    .filter((terms): terms is PledgeTerms => terms !== undefined)
    .map((terms) => borrowerStanding(terms, nowMs));
  const receipts = receiptsOf(receiptObjects.data?.data ?? []);

  const availableBaseUnits = BigInt(balance.data?.totalBalance ?? '0');
  const totals = summarizeWallet({ availableBaseUnits, lender, borrower });

  return {
    isLoading:
      deployment.isLoading ||
      (ready &&
        (balance.isLoading ||
          lenderNotes.isLoading ||
          borrowerNotes.isLoading ||
          receiptObjects.isLoading)),
    isError:
      deployment.isError ||
      balance.isError ||
      lenderNotes.isError ||
      borrowerNotes.isError ||
      receiptObjects.isError ||
      pledges.isError,
    hasWallet: address !== null,
    decimals,
    availableBaseUnits,
    lender,
    borrower,
    receipts,
    totals,
  };
}
