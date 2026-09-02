import { describe, expect, it } from 'vitest';
import {
  nameForAuditAction,
  nameForEntryDirection,
  nameForLedgerKind,
  nameForListingStatus,
  nameForReceiptStatus,
} from './status-copy';

/* Nothing a person reads should be in the shape a database stores it. This
   catches a value added to an enum later and pasted through raw, which is
   how the wallet came to be showing HOLD_FUNDS in the first place. */
const screamingSnakeCase = /^[A-Z][A-Z0-9_]*$/;
const snakeCase = /^[a-z][a-z0-9_]*$/;

const ledgerKinds = [
  'DEPOSIT',
  'HOLD_FUNDS',
  'REFUND_HOLD',
  'ORIGINATE_LOAN',
  'REPAY_LOAN',
  'SETTLE_LIQUIDATION',
  'WITHDRAW',
];

const auditActions = [
  'accept_offer',
  'attach_photo',
  'begin_intake',
  'cancel_listing',
  'claim_receipt',
  'close_liquidation',
  'confirm_release',
  'create_listing',
  'issue_receipt',
  'mark_default',
  'open_liquidation',
  'pause_system',
  'place_bid',
  'place_offer',
  'publish_listing',
  'reclaim_bid',
  'reclaim_hold',
  'reconcile_vault',
  'record_appraisal',
  'repay_loan',
  'request_redemption',
  'schedule_liquidation',
  'seal_intake',
  'unpause_system',
  'update_intake',
  'update_protocol_parameters',
  'verify_redemption',
  'withdraw_offer',
];

describe('nameForLedgerKind', () => {
  it('says what happened to the money', () => {
    expect(nameForLedgerKind('HOLD_FUNDS')).toBe('Held for an offer');
    expect(nameForLedgerKind('ORIGINATE_LOAN')).toBe('Loan funded');
    expect(nameForLedgerKind('WITHDRAW')).toBe('Withdrawal');
  });

  it.each(ledgerKinds)('never shows %s in the shape the database stores it', (kind) => {
    expect(nameForLedgerKind(kind)).not.toMatch(screamingSnakeCase);
  });

  it('shows an unknown kind raw rather than throwing', () => {
    expect(nameForLedgerKind('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('nameForEntryDirection', () => {
  /* Debit and credit are correct and are the wrong words for somebody
     looking at their own balance. */
  it('reads as money arriving and leaving', () => {
    expect(nameForEntryDirection('CREDIT')).toBe('In');
    expect(nameForEntryDirection('DEBIT')).toBe('Out');
  });

  it('shows an unknown direction raw', () => {
    expect(nameForEntryDirection('SIDEWAYS')).toBe('SIDEWAYS');
  });
});

describe('nameForAuditAction', () => {
  it('reads as something that already happened', () => {
    expect(nameForAuditAction('place_offer')).toBe('placed an offer');
    expect(nameForAuditAction('pause_system')).toBe('paused trading');
  });

  it.each(auditActions)('names %s rather than echoing the identifier', (action) => {
    expect(nameForAuditAction(action)).not.toMatch(snakeCase);
  });

  it('shows an unknown action raw', () => {
    expect(nameForAuditAction('do_a_new_thing')).toBe('do_a_new_thing');
  });
});

/* The six that already existed keep working. */
describe('the statuses that were already named', () => {
  it('still names them', () => {
    expect(nameForReceiptStatus('IN_VAULT')).toBe('In the vault');
    expect(nameForListingStatus('MATCHED')).toBe('Funded');
  });
});
