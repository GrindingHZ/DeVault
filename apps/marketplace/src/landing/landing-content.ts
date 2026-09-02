import content from './landing-content.json';

/* The landing page copy and figures, imported from the design handoff rather
   than retyped.

   Every amount here is also in the seed, and the two have to agree: a page
   that quotes AUD 19,500.00 for the Rolex while the demo behind the sign in
   button shows something else is worse than a page with no figures on it. The
   handoff shipped this as JSON for exactly that reason, so it is copied in
   whole and typed here rather than transcribed. */

export type StandIn = 'watch' | 'bullion' | 'jewellery' | 'collectible' | 'art';

export interface InventoryItem {
  readonly name: string;
  readonly category: string;
  readonly appraisedDisplay: string;
  readonly ltvPct: number;
  readonly maxAdvanceDisplay: string;
  readonly serials: readonly string[];
  readonly standIn: StandIn;
}

export interface BookOffer {
  readonly ratePctPerYear: number;
  readonly amountMinor: number;
  readonly amountDisplay: string;
  readonly lender: string;
  readonly arrivesAtStage: number;
}

export interface StationField {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}

export interface Station {
  readonly label: string;
  readonly status: string;
  readonly body: string;
  readonly fields: readonly StationField[];
}

export interface HowStep {
  readonly numeral: string;
  readonly heading: string;
  readonly body: string;
}

export interface LiquidityTrack {
  readonly category: string;
  readonly ltvPct: number;
  readonly reason: string;
}

export interface TimelineStop {
  readonly mark: string;
  readonly heading: string;
  readonly body: string;
}

export interface EngineeringCard {
  readonly heading: string;
  readonly body: string;
  readonly items?: readonly string[];
}

/* The JSON is the source of truth for the values; these narrow its inferred
   types to the shapes the components read. */
export const terms = content.terms;
export const inventory = content.inventory as readonly InventoryItem[];
export const orderBook = content.orderBook;
export const bookOffers = content.orderBook.offers as readonly BookOffer[];
export const heroClauses = content.heroClauses as readonly string[];
export const howItWorks = content.howItWorks as readonly HowStep[];
export const receiptLife = content.receiptLife;
export const stations = content.receiptLife.stations as readonly Station[];
export const liquidityTracks = content.liquidityTracks as readonly LiquidityTrack[];
export const defaultTimeline = content.defaultTimeline as readonly TimelineStop[];
export const engineering = content.engineering as readonly EngineeringCard[];
export const copy = content.sectionCopy;

/* The handoff carries a hex against every status word. The colour is not read
   from it: this scope has tokens for exactly these states and a landing page
   is not the place a fork in the palette starts. The word is the key and the
   token is the answer. */
export type LandingTone = 'neutral' | 'live' | 'accent' | 'warn' | 'danger';

const toneByStatus: Record<string, LandingTone> = {
  Sealed: 'neutral',
  Listed: 'live',
  Funded: 'accent',
  Maturing: 'warn',
  Redeemed: 'accent',
};

export function toneForStatus(status: string): LandingTone {
  return toneByStatus[status] ?? 'neutral';
}

const toneByTimelineMark: Record<string, LandingTone> = {
  'DAY 30': 'accent',
  'DAY 31–37': 'warn',
  'DAY 37–67': 'danger',
  'AFTER SALE': 'accent',
};

export function toneForTimelineMark(mark: string): LandingTone {
  return toneByTimelineMark[mark] ?? 'neutral';
}
