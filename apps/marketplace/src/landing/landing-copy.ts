/* The words. Figures, item names and serials stay in landing-content.json,
   because those have to agree with the seed and are not ours to edit. The
   prose is ours, and it lives here so the two can never be confused.

   The handoff shipped nine sections and a fuller draft of every one. This is
   that cut to four. A landing page is read standing up: a glance per section,
   then a decision about whether to keep going. Nine sections is not a page, it
   is a document, and the two scroll scrubbed retellings of the same five step
   flow were the same argument three times.

   What survived is what a reader has to know before signing in: what this is,
   what it costs, how much it lends, and what happens if they do not repay.
   Everything that was true but not load bearing is gone. */

export const heroEyebrow = 'A pawn shop with a public order book';

/* Three beats. The whole business model before the first section, so nothing
   below has to explain the flow again. */
export const heroClauses = [
  'You have a gold bar and a cash flow problem.',
  'Hand it to a vault. Walk out with a receipt.',
  'Lenders bid. You take the cheapest.',
] as const;

export const heroCta = 'See the order book';

export const book = {
  eyebrow: 'The order book',
  heading: 'A pawn shop sets the rate. Here, lenders undercut each other.',
  lede: 'One receipt, open to every lender at once. Cheapest at the top.',
  settlementLabel: 'If you take the best offer',
  /* Kept because people genuinely confuse the two, and the page puts them
     next to each other. */
  figureNote: 'Interest and total repayable are different numbers. Nothing compounds.',
  footnote: 'Demonstration book. Lenders shown by reference only.',
} as const;

export const liquidity = {
  eyebrow: 'What it lends',
  heading: 'Sixty percent of a gold bar. Thirty percent of a painting.',
  lede: 'One sells the same day. The other is an opinion.',
} as const;

export const custody = {
  eyebrow: 'Custody',
  heading: 'Nothing is repossessed, because we are already holding it.',
  held: {
    heading: 'Your object',
    body: 'Appraised, photographed, sealed, insured. The intake record is hashed when written, so it cannot be edited later.',
  },
  money: {
    heading: 'Your money',
    body: 'An offer holds your balance rather than spending it. Outbid, and the hold is yours to reclaim.',
  },
  /* One line per stop. The rail carries the sequence; the words do not need
     to repeat it. */
  timeline: [
    'Repayment due. Pay and the seal is broken the same day.',
    'Seven days of grace. At risk, not defaulted. Nothing is sold.',
    'Default, then thirty days of holding. Still redeemable.',
    'What you owe comes out of the sale. The surplus is yours.',
  ],
} as const;

export const footer = {
  close: 'Bring the object. Take the cheapest offer.',
  cta: 'Sign in',
  markCaption: 'The ledger, custody, and the name',
  finePrint: 'A demonstration build. Figures are the seeded dataset.',
} as const;

export const signIn = {
  title: 'Sign in',
  lede: 'Borrowers and lenders use the same account.',
} as const;
