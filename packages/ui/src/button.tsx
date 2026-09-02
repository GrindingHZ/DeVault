import type { ButtonHTMLAttributes, ReactElement } from 'react';

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
        /* The gap replaces the space a flex container eats. A label built
           from a word and an element, as in "Lend" beside a Money, rendered
           as one run without it. */
        'inline-flex min-h-row cursor-pointer items-center justify-center gap-1 rounded-md px-4',
        'font-body text-sm font-medium transition-colors duration-control ease-enter',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-active',
        'disabled:cursor-not-allowed disabled:opacity-50',
        classByVariant[variant],
        className ?? '',
      ].join(' ')}
    />
  );
}
