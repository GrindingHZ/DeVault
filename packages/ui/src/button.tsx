import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { pressable } from './pressable';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const classByVariant: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-ink-inverse hover:bg-accent-hover',
  secondary: 'border border-edge-strong bg-surface-raised text-ink-primary hover:bg-surface-sunken',
  danger: 'bg-status-danger text-ink-inverse hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      {...rest}
      /* The caller's classes go last so they win. Spreading `rest` over a
         className computed before it silently dropped every layout class a
         caller passed, which is why a button asked to fill its row did not. */
      className={[
        pressable,
        /* The gap replaces the space a flex container eats. A label built
           from a word and an element, as in "Lend" beside a Money, rendered
           as one run without it. */
        'inline-flex min-h-row items-center justify-center gap-1 rounded-md px-4',
        'font-body text-sm font-medium',
        /* The shadow is what makes the one pixel of lift legible. Without it
           the button moves and nothing explains why, which reads as a jitter
           rather than as a thing being picked up. */
        'hover:shadow-raised disabled:hover:shadow-none',
        classByVariant[variant],
        className ?? '',
      ].join(' ')}
    />
  );
}
