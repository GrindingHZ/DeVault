import type { LandingTone } from './landing-content';

/* Tailwind needs whole class names, so every tone is written out rather than
   interpolated. Four small records instead of one, because a tone means a
   different property in each place it is used and a single map would have to
   carry all four for every entry. */

export const toneText: Record<LandingTone, string> = {
  neutral: 'text-ink-secondary',
  live: 'text-status-active',
  accent: 'text-accent',
  warn: 'text-status-warning',
  danger: 'text-status-danger',
};

export const toneBorder: Record<LandingTone, string> = {
  neutral: 'border-edge-strong',
  live: 'border-status-active',
  accent: 'border-accent',
  warn: 'border-status-warning',
  danger: 'border-status-danger',
};

export const toneDot: Record<LandingTone, string> = {
  neutral: 'bg-ink-secondary',
  live: 'bg-status-active',
  accent: 'bg-accent',
  warn: 'bg-status-warning',
  danger: 'bg-status-danger',
};

/* The handoff sets a status chip on a 14 percent wash of its own foreground.
   Tailwind cannot alpha composite a token that holds a hex, so the chip is
   drawn as a hairline outline in the tone instead. It carries the same
   meaning, keeps the palette unforked, and the word inside it is doing the
   work either way. */
export function toneChip(tone: LandingTone): string {
  return `border ${toneBorder[tone]} ${toneText[tone]}`;
}
