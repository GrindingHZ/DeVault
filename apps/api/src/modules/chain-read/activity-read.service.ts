import { Inject, Injectable } from '@nestjs/common';
import type { ChainActivityEntry, ChainActivityReference } from '@depawn/contracts';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { decodeBytes } from './chain-read-shapes';
import type { Json } from './chain-read-shapes';
import { DeploymentNotFound } from './wallet-read.service';

interface RawEvent {
  readonly eventType: string;
  readonly transactionDigest: string;
  readonly json: Json | null;
  readonly timestampMs: number | null;
}

/* The short name of a Move event, `ListingOpened` from
   `<package>::pledge::ListingOpened`. */
function eventName(eventType: string): string {
  const parts = eventType.split('::');
  return parts[parts.length - 1] ?? eventType;
}

/* What a transaction did, named for a person. One transaction can emit several
   events (an acceptance emits both the offer's acceptance and the loan's
   origination), so the most telling event wins, in this order. The `kind` is a
   stable code the ui keys its wording off; the label and description are the
   words. */
const classes: readonly {
  readonly event: string;
  readonly kind: string;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    event: 'LoanOriginated',
    kind: 'LOAN_STARTED',
    label: 'Accepted an offer',
    description: 'Funded a loan against the pledged item at the accepted rate.',
  },
  {
    event: 'CollateralClaimed',
    kind: 'COLLATERAL_CLAIMED',
    label: 'Claimed the collateral',
    description: 'Took the pledged item after the loan defaulted.',
  },
  {
    event: 'LoanSettled',
    kind: 'PAYOFF_COLLECTED',
    label: 'Collected a payoff',
    description: 'Pulled the repaid principal and interest from a loan.',
  },
  {
    event: 'LoanRepaid',
    kind: 'LOAN_REPAID',
    label: 'Repaid a loan',
    description: 'Repaid the loan; the item is unwrapped back to the borrower.',
  },
  {
    event: 'ListingCancelled',
    kind: 'LISTING_CANCELLED',
    label: 'Took a listing down',
    description: 'Unwrapped the item back to the wallet, off the market.',
  },
  {
    event: 'ListingOpened',
    kind: 'ITEM_LISTED',
    label: 'Listed an item',
    description: 'Wrapped the item into a pledge and opened it for offers.',
  },
  {
    event: 'OfferAccepted',
    kind: 'OFFER_ACCEPTED',
    label: 'Accepted an offer',
    description: 'Took a lender offer and started the loan.',
  },
  {
    event: 'OfferMade',
    kind: 'OFFER_MADE',
    label: 'Made a loan offer',
    description: 'Locked funds behind an offer to lend at a rate.',
  },
  {
    event: 'OfferRefunded',
    kind: 'OFFER_RECLAIMED',
    label: 'Reclaimed an offer',
    description: 'Pulled the funds back from an offer that lost or expired.',
  },
  {
    event: 'PositionListed',
    kind: 'POSITION_LISTED',
    label: 'Listed a loan for sale',
    description: 'Put a lender position on the secondary market.',
  },
  {
    event: 'PositionSold',
    kind: 'POSITION_SOLD',
    label: 'Sold a loan position',
    description: 'Sold a lender position to a buyer.',
  },
  {
    event: 'PositionDelisted',
    kind: 'POSITION_DELISTED',
    label: 'Delisted a loan position',
    description: 'Took a lender position off the secondary market.',
  },
  {
    event: 'RedemptionRequested',
    kind: 'REDEMPTION_REQUESTED',
    label: 'Requested an item back',
    description: 'Burned the receipt to collect the item at the vault counter.',
  },
  {
    event: 'ReceiptIssued',
    kind: 'RECEIPT_ISSUED',
    label: 'Received a vault receipt',
    description: 'The vault issued a receipt for a deposited item.',
  },
];

const fallbackClass = {
  kind: 'ACTIVITY',
  label: 'On-chain activity',
  description: 'A transaction on the loan book.',
};

function classify(names: ReadonlySet<string>): {
  kind: string;
  label: string;
  description: string;
} {
  for (const one of classes) {
    if (names.has(one.event)) {
      return { kind: one.kind, label: one.label, description: one.description };
    }
  }
  return fallbackClass;
}

/* The friendly name of an object field, `pledge_id` to `Pledge`. */
const objectLabels: Record<string, string> = {
  pledge_id: 'Pledge',
  hold_id: 'Offer hold',
  note_id: 'Note',
  listing_id: 'Sale listing',
  lender_note_id: 'Lender note',
  borrower_note_id: 'Borrower note',
  receipt_id: 'Receipt',
};

const addressLabels: Record<string, string> = {
  borrower: 'Borrower',
  lender: 'Lender',
  owner: 'Lender',
  claimant: 'Claimant',
  holder: 'Holder',
  seller: 'Seller',
  buyer: 'Buyer',
};

function labelFromKey(key: string): string {
  return (
    objectLabels[key] ??
    key
      .replace(/_id$/, '')
      .replace(/_/g, ' ')
      .replace(/^./, (character) => character.toUpperCase())
  );
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
}

/* The member's own on-chain history, read from the events their transactions
   emitted and grouped one row per transaction. Each row names what the
   transaction did and lists every hash it touched: the transaction itself, the
   objects it created or moved, and the accounts on either side, so the reader
   can open each on a Sui explorer as proof. */
@Injectable()
export class ActivityReadService {
  constructor(
    @Inject(WALLET_READ_CLIENT) private readonly client: ChainClient,
    private readonly prisma: PrismaService,
  ) {}

  async read(owner: string): Promise<ChainActivityEntry[]> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new DeploymentNotFound();
    }
    const packageId = deployment.packageId;
    const response = await this.client.core.listEvents({
      filter: { sender: owner },
      limit: 100,
      order: 'descending',
    });

    /* One row per transaction, in the order the node returned them (newest
       first). Only this package's events are ours to name; a sponsored gas
       coin split emits nothing here. */
    const order: string[] = [];
    const byTransaction = new Map<string, RawEvent[]>();
    for (const raw of response.events) {
      const event = raw as {
        eventType?: unknown;
        transactionDigest?: unknown;
        json?: unknown;
        timestampMs?: unknown;
      };
      if (
        typeof event.eventType !== 'string' ||
        typeof event.transactionDigest !== 'string' ||
        !event.eventType.startsWith(packageId)
      ) {
        continue;
      }
      const digest = event.transactionDigest;
      if (!byTransaction.has(digest)) {
        byTransaction.set(digest, []);
        order.push(digest);
      }
      byTransaction.get(digest)?.push({
        eventType: event.eventType,
        transactionDigest: digest,
        json: event.json === null || event.json === undefined ? null : (event.json as Json),
        timestampMs: timeOf(event.timestampMs),
      });
    }

    return order.map((digest) => this.entryOf(digest, byTransaction.get(digest) ?? []));
  }

  private entryOf(digest: string, events: readonly RawEvent[]): ChainActivityEntry {
    const names = new Set(events.map((event) => eventName(event.eventType)));
    const { kind, label, description } = classify(names);

    /* The transaction first, then every distinct hash its events named. A field
       ending in `_id` that holds an address is an object; a known party field is
       an account; the receipt key is the api's own reference, shown but not
       linked because it is not an on-chain address. */
    const references: ChainActivityReference[] = [
      { label: 'Transaction', value: digest, kind: 'transaction' },
    ];
    const seen = new Set<string>([`transaction:${digest}`]);
    const add = (reference: ChainActivityReference): void => {
      const token = `${reference.kind}:${reference.value}`;
      if (!seen.has(token)) {
        seen.add(token);
        references.push(reference);
      }
    };
    for (const event of events) {
      if (event.json === null) {
        continue;
      }
      for (const [key, value] of Object.entries(event.json)) {
        if (key.endsWith('_id') && isObjectId(value)) {
          add({ label: labelFromKey(key), value, kind: 'object' });
        } else if (key in addressLabels && isObjectId(value)) {
          add({ label: addressLabels[key] ?? 'Account', value, kind: 'address' });
        } else if (key === 'receipt_key') {
          const decoded = decodeBytes(value);
          if (decoded !== '') {
            add({ label: 'Receipt key', value: decoded, kind: 'key' });
          }
        }
      }
    }

    const atMs = events.map((event) => event.timestampMs).find((value) => value !== null) ?? null;
    return { transactionDigest: digest, kind, label, description, atMs, references };
  }
}

function timeOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}
