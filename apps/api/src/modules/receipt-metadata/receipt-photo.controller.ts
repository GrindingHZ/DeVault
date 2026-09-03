import { Controller, Get, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { ReceiptMetadataStore } from './receipt-metadata.store';

/* The receipt's main photograph as raw bytes, at the url the restored ui builds
   for every item image (`/receipts/{receiptKey}/photo`). A receipt with no
   stored photograph answers not-found, which the ui reads as "no image". */
@Controller('receipts')
export class ReceiptPhotoController {
  constructor(private readonly store: ReceiptMetadataStore) {}

  @Get(':receiptKey/photo')
  async photo(@Param('receiptKey') receiptKey: string): Promise<StreamableFile> {
    const image = await this.store.readMainImage(receiptKey);
    if (image === null) {
      throw new NotFoundException('This receipt has no photograph');
    }
    return new StreamableFile(image.bytes, { type: image.mime });
  }
}
