import { z } from 'zod';

/* Which position is open, in the URL rather than in React state, the same
   rule the workspace follows: the back button works, a refresh restores the
   view, and a reader can send somebody the exact position they are looking
   at (docs/05-frontend.md). */
export const saleSelectionSchema = z.object({
  sale: z.string().min(1).optional(),
});

export type SaleSelection = z.infer<typeof saleSelectionSchema>;

export function parseSaleSelection(input: Record<string, unknown>): SaleSelection {
  const parsed = saleSelectionSchema.safeParse(input);
  // A hand edited link lands on the market rather than on an error page.
  return parsed.success ? parsed.data : {};
}
