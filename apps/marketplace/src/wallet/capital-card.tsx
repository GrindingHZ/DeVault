import { fetchBalance, fetchLedgerEntries, fetchMyLoans } from '@depawn/contracts';
import type { LedgerEntryResponse } from '@depawn/contracts';
import type { StatusTone } from '@depawn/ui';
import {
  Card,
  Meter,
  Skeleton,
  Tab,
  TabStrip,
  ValueChart,
  formatAmount,
  formatInstant,
  formatMoney,
} from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { walletKeys } from '../wallet-keys';
import { buildCapitalSeries, changeOver, reconcilesWith } from './capital-series';

const oneDay = 24 * 60 * 60 * 1000;

/* Matched to what the demo actually holds. The seed builds about two months
   of history, so a one year tab would be a tenth of a line and the rest
   empty, and a one day tab would be a single flat point. */
const windows = [
  { id: '1W', label: '1W', ms: 7 * oneDay },
  { id: '1M', label: '1M', ms: 30 * oneDay },
  { id: '3M', label: '3M', ms: 90 * oneDay },
  { id: 'ALL', label: 'All', ms: null },
] as const;

type WindowId = (typeof windows)[number]['id'];

/* The ledger is paged and the chart needs all of it. Bounded rather than
   looped to exhaustion: past this the reconciliation below reports a short
   history and the page says so, which is better than a browser fetching for
   a minute. */
const pageLimit = 200;
const maximumPages = 20;

async function fetchWholeLedger(): Promise<readonly LedgerEntryResponse[]> {
  const all: LedgerEntryResponse[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maximumPages; page += 1) {
    const response = await fetchLedgerEntries(cursor, pageLimit);
    all.push(...response.items);
    if (response.nextCursor === null) {
      break;
    }
    cursor = response.nextCursor;
  }
  return all;
}

export function CapitalCard(): ReactElement {
  const [windowId, setWindowId] = useState<WindowId>('1M');
  /* The day under the pointer, which every figure on this card follows.
     Reading the chart out in a tooltip meant the breakdown underneath went on
     describing today while the pointer was three weeks back; moving the whole
     card instead answers the question a reader actually has, which is how the
     money was divided on the day they are pointing at. */
  const [readingAtMs, setReadingAtMs] = useState<number | null>(null);

  const balanceQuery = useQuery({ queryKey: walletKeys.balance, queryFn: fetchBalance });
  const ledgerQuery = useQuery({ queryKey: walletKeys.history, queryFn: fetchWholeLedger });
  const loansQuery = useQuery({
    queryKey: walletKeys.lentLoans,
    queryFn: () => fetchMyLoans('lender'),
  });

  const isPending = balanceQuery.isPending || ledgerQuery.isPending || loansQuery.isPending;
  const balance = balanceQuery.data;
  const entries = ledgerQuery.data ?? [];
  const loans = loansQuery.data?.items ?? [];

  if (isPending) {
    return (
      <Card title="Your capital">
        <Skeleton lineCount={6} />
      </Card>
    );
  }

  if (balance === undefined) {
    return (
      <Card title="Your capital">
        <p role="alert" className="font-body text-sm text-status-danger">
          Your capital could not be worked out. The balance below is still correct.
        </p>
      </Card>
    );
  }

  const chosen = windows.find((one) => one.id === windowId) ?? windows[1];
  /* The server's clock, never the browser's. A demo process runs weeks ahead
     (docs/10-flows.md flow 15), so a series ending at `Date.now()` would stop
     weeks before the figures printed beside it. */
  const asOfMs = Date.parse(loansQuery.data?.asOf ?? '') || Date.now();
  const points = buildCapitalSeries({ entries, loans, asOfMs, windowMs: chosen.ms });
  const change = changeOver(points);
  const closing = points[points.length - 1];

  const isWholeHistory = reconcilesWith(
    entries,
    balance.available.minorUnits,
    balance.held.minorUnits,
  );

  const currency = balance.available.currency;
  /* The day being read: the one under the pointer, or today when the pointer
     is away. A hovered day is a reconstruction from the ledger; today's cash
     is the balance the server reports, which is the figure of record. */
  const reading =
    readingAtMs === null ? null : (points.find((one) => one.atMs === readingAtMs) ?? null);
  const shown = reading ?? closing;

  const lent = shown?.lentMinorUnits ?? 0n;
  const interest = shown?.interestMinorUnits ?? 0n;
  const defaulted = shown?.defaultedMinorUnits ?? 0n;
  const available =
    reading === null ? BigInt(balance.available.minorUnits) : reading.availableMinorUnits;
  const held = reading === null ? BigInt(balance.held.minorUnits) : reading.heldMinorUnits;
  const total = available + held + lent + interest + defaulted;

  /* Hovering re-reads the change as the run from the opening of the window up
     to that day, rather than leaving a figure on screen that describes a
     period ending somewhere else. */
  const shownChange =
    reading === null || change === null
      ? change
      : {
          openingMinorUnits: change.openingMinorUnits,
          closingMinorUnits: reading.totalMinorUnits,
          deltaMinorUnits: reading.totalMinorUnits - change.openingMinorUnits,
        };
  const changeTrail =
    reading === null
      ? `over ${chosen.id === 'ALL' ? 'all time' : `the last ${chosen.label}`}`
      : `by ${formatInstant(new Date(reading.atMs).toISOString(), 'date')}`;

  /* Every band is drawn in the same neutral. The status tones mean
     something in this product (a loan at risk, a run that failed), and
     spending one of them on "committed to offers" would teach a reader that
     amber is a category rather than a warning. Length carries the size, the
     label carries which band it is. */
  const bands: readonly {
    readonly label: string;
    readonly amount: bigint;
    readonly tone: StatusTone;
    readonly note?: string;
  }[] = [
    { label: 'Available to spend', amount: available, tone: 'neutral' },
    { label: 'Committed to offers', amount: held, tone: 'neutral' },
    { label: 'Out on loans', amount: lent, tone: 'neutral' },
    { label: 'Interest earned', amount: interest, tone: 'neutral' },
    /* Only when there is one. A row reading zero on every healthy account is
       clutter, and this is an exception rather than a category.

       The warning tone is the one status colour spent anywhere on this card,
       and it is spent correctly: this is a state a reader has to act on, not
       a fifth kind of money. */
    ...(defaulted > 0n
      ? [
          {
            label: 'In default',
            amount: defaulted,
            tone: 'warning' as StatusTone,
            note: 'Still owed to you. Claim the collateral from your portfolio.',
          },
        ]
      : []),
  ];

  return (
    <Card title="Your capital">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* Which day every figure on this card is answering for. Always
                present rather than appearing on hover: a caption that arrives
                and leaves would shift the number underneath it while somebody
                is reading along the line. */}
            <p data-testid="capital-as-of" className="font-body text-xs text-ink-secondary">
              {reading === null
                ? 'Today'
                : formatInstant(new Date(reading.atMs).toISOString(), 'date')}
            </p>
            {/* The headline is everything the reader owns, not the cash they
                happen to be holding. Cash falls when money is successfully
                lent, so a wallet that led with it would report a good month
                as a loss. */}
            <p
              data-testid="capital-total"
              className="font-figure text-3xl font-semibold tabular-nums text-ink-primary"
            >
              {formatMoney({ minorUnits: total.toString(), currency })}
            </p>
            {shownChange === null ? null : (
              <p
                data-testid="capital-change"
                className={`font-figure text-sm tabular-nums ${
                  shownChange.deltaMinorUnits < 0n
                    ? 'text-market-adverse'
                    : 'text-market-favourable'
                }`}
              >
                {shownChange.deltaMinorUnits < 0n ? '' : '+'}
                {formatAmount({ minorUnits: shownChange.deltaMinorUnits.toString(), currency })}
                <span className="ml-1 font-body text-ink-secondary">{changeTrail}</span>
              </p>
            )}
          </div>

          <TabStrip label="How far back">
            {windows.map((one) => (
              <Tab
                key={one.id}
                label={one.label}
                isActive={one.id === windowId}
                testId={`capital-window-${one.id}`}
                onSelect={() => setWindowId(one.id)}
              />
            ))}
          </TabStrip>
        </div>

        <ValueChart
          testId="capital-chart"
          currency={currency}
          label={`Everything you own over ${chosen.id === 'ALL' ? 'all time' : `the last ${chosen.label}`}`}
          /* The figures above and below are the readout, so the chart does
             not raise a second one over the top of them. */
          readout="external"
          onHoverChange={setReadingAtMs}
          series={[
            {
              id: 'total',
              label: 'Everything you own',
              role: 'subject',
              shape: 'smooth',
              points: points.map((point) => ({
                atMs: point.atMs,
                minorUnits: point.totalMinorUnits,
              })),
            },
            {
              id: 'cash',
              label: 'Cash in your wallet',
              role: 'reference',
              shape: 'smooth',
              points: points.map((point) => ({
                atMs: point.atMs,
                minorUnits: point.cashMinorUnits,
              })),
            },
          ]}
        />

        {/* Where the money actually is. Available and held are not all of it
            the moment a loan is running, and a wallet that showed only those
            two left a lender staring at an empty page with no account of the
            rest. */}
        <dl className="flex flex-col gap-2" data-testid="capital-bands">
          {bands.map((band) => (
            <div key={band.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <dt
                  className={`font-body text-sm ${
                    band.tone === 'warning' ? 'text-status-warning' : 'text-ink-secondary'
                  }`}
                >
                  {band.label}
                </dt>
                <dd className="font-figure text-sm tabular-nums text-ink-primary">
                  {formatAmount({ minorUnits: band.amount.toString(), currency })}
                </dd>
              </div>
              <Meter
                filledBasisPoints={total <= 0n ? 0 : Number((band.amount * 10_000n) / total)}
                tone={band.tone}
                label={band.label}
                valueText={`${formatAmount({ minorUnits: band.amount.toString(), currency })} of ${formatAmount({ minorUnits: total.toString(), currency })}`}
              />
              {band.note === undefined ? null : (
                <p className="font-body text-xs text-ink-secondary">{band.note}</p>
              )}
            </div>
          ))}
        </dl>

        {isWholeHistory ? null : (
          /* Said rather than hidden. The alternative is a line that quietly
             starts too late and a reader who trusts it. */
          <p className="font-body text-xs text-ink-secondary">
            This chart covers the most recent movements only. Your account has more history than the
            page loaded.
          </p>
        )}
      </div>
    </Card>
  );
}
