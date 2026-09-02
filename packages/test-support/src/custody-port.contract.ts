import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustodyReceipt } from '@depawn/api/src/domain/custody/custody-receipt';
import type { CustodyPort, IssueReceiptCommand } from '@depawn/api/src/domain/ports/custody.port';
import type { UnitOfWorkContext } from '@depawn/api/src/domain/ports/unit-of-work';
import { accountIdOf, loanIdOf } from '@depawn/api/src/domain/shared/identifiers';
import type { ReceiptId } from '@depawn/api/src/domain/shared/identifiers';

export interface CustodyPortTestSubject {
  readonly port: CustodyPort;
  runInUnitOfWork<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
  /* A valid issue command against a vault that exists in the subject's world. */
  nextIssueCommand(): IssueReceiptCommand;
  receiptById(id: ReceiptId): Promise<CustodyReceipt | null>;
  close(): Promise<void>;
}

/* One suite, every implementation, mirroring the settlement contract: when
   the Sui adapter passes what the database adapter passes, the custody seam
   is provably behaviour preserving (docs/06-testing.md layer 3). */
export function describeCustodyPortContract(
  name: string,
  createSubject: () => Promise<CustodyPortTestSubject>,
): void {
  describe(`CustodyPort contract: ${name}`, () => {
    let subject: CustodyPortTestSubject;

    beforeAll(async () => {
      subject = await createSubject();
    });

    afterAll(async () => {
      await subject.close();
    });

    async function issue(): Promise<CustodyReceipt> {
      return subject.runInUnitOfWork((context) =>
        subject.port.issueReceipt(subject.nextIssueCommand(), context),
      );
    }

    it('issues a receipt in the vault carrying the appraisal snapshot', async () => {
      const command = subject.nextIssueCommand();
      const issued = await subject.runInUnitOfWork((context) =>
        subject.port.issueReceipt(command, context),
      );

      expect(issued.status).toBe('IN_VAULT');
      expect(issued.holderAccountId).toBe(command.holderAccountId);
      expect(issued.intakeRecordHash).toBe(command.intakeRecordHash);
      expect(issued.appraisedValue.minorUnits).toBe(command.appraisedValue.minorUnits);

      const persisted = await subject.receiptById(issued.id);
      expect(persisted?.status).toBe('IN_VAULT');
    });

    it('encumbers only a receipt that is in the vault', async () => {
      const receipt = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-1'), context),
      );

      const encumbered = await subject.receiptById(receipt.id);
      expect(encumbered?.status).toBe('ENCUMBERED');
      expect(encumbered?.encumberedByLoanId).toBe('CONTRACT-LOAN-1');

      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-2'), context),
        ),
      ).rejects.toThrow();
    });

    it('releases an encumbrance back to the vault', async () => {
      const receipt = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-3'), context),
      );
      await subject.runInUnitOfWork((context) =>
        subject.port.releaseEncumbrance(receipt.id, context),
      );

      const released = await subject.receiptById(receipt.id);
      expect(released?.status).toBe('IN_VAULT');
      expect(released?.encumberedByLoanId).toBeNull();
    });

    it('transfers the holder only while the receipt is in the vault', async () => {
      const receipt = await issue();
      const newHolder = accountIdOf('CONTRACT-NEW-HOLDER');
      const reference = await subject.runInUnitOfWork((context) =>
        subject.port.transferReceipt(receipt.id, newHolder, context),
      );
      expect(reference.reference).toBeTruthy();

      const transferred = await subject.receiptById(receipt.id);
      expect(transferred?.holderAccountId).toBe(newHolder);

      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-4'), context),
      );
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.transferReceipt(receipt.id, accountIdOf('CONTRACT-OTHER'), context),
        ),
      ).rejects.toThrow();
    });

    it('claims an encumbered receipt to the note holder', async () => {
      const receipt = await issue();
      const claimant = accountIdOf('CONTRACT-CLAIMANT');
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-6'), context),
      );

      const reference = await subject.runInUnitOfWork((context) =>
        subject.port.claimReceipt(receipt.id, claimant, context),
      );
      expect(reference.reference).toBeTruthy();

      // The claimant holds it in the vault, so redeeming it afterwards is
      // the ordinary flow rather than a special case.
      const claimed = await subject.receiptById(receipt.id);
      expect(claimed?.holderAccountId).toBe(claimant);
      expect(claimed?.status).toBe('IN_VAULT');
      expect(claimed?.encumberedByLoanId).toBeNull();
    });

    /* What a buyer walks away holding. Without it the winner of a sale owns
       an item the product cannot name and no flow can release to them
       (docs/OPEN-QUESTIONS.md Q-006). A Phase 3 adapter has to do the same
       thing in one transaction: destroy the old object, mint the new one. */
    it('ends the seller title and grants the buyer one for the same item', async () => {
      const receipt = await issue();
      const buyer = accountIdOf('CONTRACT-BUYER');
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-7'), context),
      );

      const reissued = await subject.runInUnitOfWork((context) =>
        subject.port.reissueToBuyer(receipt.id, buyer, context),
      );

      // The old title is spent, and spent is terminal.
      const sold = await subject.receiptById(receipt.id);
      expect(sold?.status).toBe('LIQUIDATED');

      /* The new one is a different receipt for the same item, in the vault
         under the buyer, so redeeming it is the ordinary flow. */
      expect(reissued.id).not.toBe(receipt.id);
      const held = await subject.receiptById(reissued.id);
      expect(held?.status).toBe('IN_VAULT');
      expect(held?.holderAccountId).toBe(buyer);
      expect(held?.encumberedByLoanId).toBeNull();

      /* Nothing about the item changed when it was sold, so everything that
         describes it carries over. The intake record hash especially: it is
         what the photograph and the sealed evidence hang off, and a buyer
         holding a receipt that cannot show the item would be holding paper. */
      expect(held?.intakeRecordHash).toBe(receipt.intakeRecordHash);
      expect(held?.itemDescription).toBe(receipt.itemDescription);
      expect(held?.itemCategory).toBe(receipt.itemCategory);
      expect(held?.serialNumbers).toEqual(receipt.serialNumbers);
      expect(held?.appraisedValue.minorUnits).toBe(receipt.appraisedValue.minorUnits);
      expect(held?.vaultId).toBe(receipt.vaultId);
    });

    it('reissues nothing for a receipt already spent', async () => {
      const receipt = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.reissueToBuyer(receipt.id, accountIdOf('CONTRACT-BUYER-2'), context),
      );
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.reissueToBuyer(receipt.id, accountIdOf('CONTRACT-BUYER-3'), context),
        ),
      ).rejects.toThrow();
    });

    it('refuses a claim against collateral that is not encumbered', async () => {
      const receipt = await issue();
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.claimReceipt(receipt.id, accountIdOf('CONTRACT-CLAIMANT-2'), context),
        ),
      ).rejects.toThrow();
    });

    it('burning for redemption is terminal', async () => {
      const receipt = await issue();
      const reference = await subject.runInUnitOfWork((context) =>
        subject.port.burnReceipt(receipt.id, 'REDEMPTION', context),
      );
      expect(reference.reference).toBeTruthy();

      const burned = await subject.receiptById(receipt.id);
      expect(burned?.status).toBe('RELEASED');

      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.burnReceipt(receipt.id, 'REDEMPTION', context),
        ),
      ).rejects.toThrow();
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-5'), context),
        ),
      ).rejects.toThrow();
    });

    it('burning for liquidation is terminal from either live state', async () => {
      const fromVault = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.burnReceipt(fromVault.id, 'LIQUIDATION', context),
      );
      expect((await subject.receiptById(fromVault.id))?.status).toBe('LIQUIDATED');

      const fromEncumbered = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(fromEncumbered.id, loanIdOf('CONTRACT-LOAN-6'), context),
      );
      await subject.runInUnitOfWork((context) =>
        subject.port.burnReceipt(fromEncumbered.id, 'LIQUIDATION', context),
      );
      const burned = await subject.receiptById(fromEncumbered.id);
      expect(burned?.status).toBe('LIQUIDATED');
      expect(burned?.encumberedByLoanId).toBeNull();
    });
  });
}
