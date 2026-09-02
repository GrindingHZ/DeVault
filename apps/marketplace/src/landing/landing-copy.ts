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

export const heroCta = 'See how it works';

export const life = {
  eyebrow: 'The life of one receipt',
  heading: 'One object, five states, one row in the ledger.',
} as const;

/* This section was a heading, a slogan and five bars, and it never said what
   the bars measured. A reader saw "60%" against a gold bar with no way to
   know whether that was a rate, a fee, or a share of something. The heading
   now states the mechanic, the lede gives the reason, and a worked line does
   the arithmetic once so the bars underneath it mean something. */
export const liquidity = {
  eyebrow: 'What you can borrow',
  heading: 'You borrow against a share of the appraisal, not all of it.',
  lede: 'Staff appraise the object at what it would fetch. We then lend a share of that figure, and the share depends on how quickly the object could be sold if you never came back for it. That sale is the only way the money comes back, so the faster and more certain it is, the more we lend.',
  barLabel: 'Share of the appraisal we lend',
  /* One line each, and each one is the actual reason that category sits where
     it does. The previous set were aphorisms. */
  reasons: {
    Bullion:
      'Priced against spot every day. A dealer takes it the same afternoon at a number we can look up before you leave.',
    Watches:
      'A model with a public sales record. Weeks to sell, at a price we can check against completed auctions.',
    Jewellery:
      'A certificated stone holds its price. The setting is worth its metal and little more, so we lend against the stone.',
    Collectibles:
      'Graded, so the condition is not in dispute. What it fetches still depends on who is collecting this month.',
    Art: 'One buyer at a time, and no two works are the same. An appraisal here is a judgement rather than a quote.',
  } as Record<string, string>,
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
