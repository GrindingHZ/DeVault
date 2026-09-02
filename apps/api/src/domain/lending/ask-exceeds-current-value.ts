import { DomainError } from '../shared/domain-error';
import type { Money } from '../shared/money';

export class AskExceedsCurrentValue extends DomainError {
  readonly code = 'ASK_EXCEEDS_CURRENT_VALUE';

  /* Carries the cap so the seller sees the figure they may ask, the same
     way a stale payoff quote answers with the amount now due. */
  constructor(readonly currentValue: Money) {
    super('The ask exceeds the current value of the position.');
  }
}
