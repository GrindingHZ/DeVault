import { z } from 'zod';

/* Which side of the market the table shows. In the URL rather than in React
   state, so the back button works, a refresh restores the same view, and a
   borrower can send a lender a link to what they are looking at. */
export const sides = ['all', 'borrowing', 'lending'] as const;

export type PortfolioSide = (typeof sides)[number];

export const portfolioSearchSchema = z.object({
  side: z.enum(sides).optional(),
});

export type PortfolioSearch = z.infer<typeof portfolioSearchSchema>;

export function parsePortfolioSearch(input: Record<string, unknown>): PortfolioSearch {
  /* A hand edited link lands on the portfolio rather than an error page. */
  const parsed = portfolioSearchSchema.safeParse(input);
  return parsed.success ? parsed.data : {};
}
