import { z } from 'zod';

/* Which side of the market the screen shows.

   There is no "everything". Borrowing and lending answer different questions
   with different columns: a borrower wants what a loan is costing, a lender
   wants what it is earning, and the same loan means opposite things to the
   two of them. One merged table had to drop every column that did not apply
   to both, which left it saying almost nothing.

   It lives in the URL rather than in React state, so the back button works, a
   refresh restores the same view, and the link is something a person can
   send. */
export const sides = ['borrowing', 'lending'] as const;

export type PortfolioSide = (typeof sides)[number];

export const defaultSide: PortfolioSide = 'borrowing';

export const portfolioSearchSchema = z.object({
  side: z.enum(sides).optional(),
});

export type PortfolioSearch = z.infer<typeof portfolioSearchSchema>;

export function parsePortfolioSearch(input: Record<string, unknown>): PortfolioSearch {
  /* A hand edited link lands on the portfolio rather than an error page. */
  const parsed = portfolioSearchSchema.safeParse(input);
  return parsed.success ? parsed.data : {};
}
