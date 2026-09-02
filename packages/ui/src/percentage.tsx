import type { ReactElement } from 'react';

/* A share, which is not a rate. Rate renders "per annum" because a loan is
   quoted that way, and the admin dashboard briefly said a vault was 3.60
   percent full per annum by borrowing it for the job. */
export function formatPercentage(basisPoints: number): string {
  const sign = basisPoints < 0 ? '-' : '';
  const magnitude = Math.abs(basisPoints);
  const whole = Math.trunc(magnitude / 100);
  const fraction = magnitude % 100;
  return `${sign}${String(whole)}.${fraction.toString().padStart(2, '0')}%`;
}

export interface PercentageProps {
  readonly basisPoints: number;
}

export function Percentage({ basisPoints }: PercentageProps): ReactElement {
  return (
    <span className="font-mono tabular-nums text-ink-primary">{formatPercentage(basisPoints)}</span>
  );
}
