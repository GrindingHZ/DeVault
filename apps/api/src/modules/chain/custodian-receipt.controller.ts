import { Body, Controller, Post } from '@nestjs/common';
import { issueVaultReceiptRequestSchema } from '@depawn/contracts';
import type { IssueVaultReceiptRequest, IssueVaultReceiptResponse } from '@depawn/contracts';
import { Roles } from '../shared/http/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { CustodianReceiptService } from './custodian-receipt.service';

/* The custodian's one on-chain action. Vault staff only: issuing a receipt is
   the platform vouching that it physically holds an appraised item, which is
   the trust the whole book rests on. */
@Controller('chain')
export class CustodianReceiptController {
  constructor(private readonly receipts: CustodianReceiptService) {}

  @Post('receipts/issue')
  @Roles('VAULT_STAFF')
  issue(
    @Body(new ZodValidationPipe(issueVaultReceiptRequestSchema)) body: IssueVaultReceiptRequest,
  ): Promise<IssueVaultReceiptResponse> {
    return this.receipts.issue(body);
  }
}
