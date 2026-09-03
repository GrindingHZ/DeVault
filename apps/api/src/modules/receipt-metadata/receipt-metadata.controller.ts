import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { ReceiptMetadataResponse } from '@depawn/contracts';
import { ReceiptMetadataStore } from './receipt-metadata.store';

/* The name and photographs behind a receipt, keyed by the receipt_key it
   carries on chain. Any signed-in member can read one: a borrower to see their
   own item, a lender to see the collateral behind a listing. */
@Controller('chain')
export class ReceiptMetadataController {
  constructor(private readonly store: ReceiptMetadataStore) {}

  @Get('receipts/:receiptKey/metadata')
  async read(@Param('receiptKey') receiptKey: string): Promise<ReceiptMetadataResponse> {
    const metadata = await this.store.read(receiptKey);
    if (metadata === null) {
      throw new NotFoundException('This receipt has no stored name or photographs');
    }
    return {
      name: metadata.name,
      mainImage: metadata.mainImage,
      secondaryImages: [...metadata.secondaryImages],
    };
  }
}
