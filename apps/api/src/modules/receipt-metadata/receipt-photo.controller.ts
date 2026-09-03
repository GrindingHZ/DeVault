import { Controller, Get, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { Public } from '../shared/http/public.decorator';
import { ReceiptMetadataStore } from './receipt-metadata.store';

/* The receipt's main photograph as raw bytes, at the url the restored ui builds
   for every item image (`/receipts/{receiptKey}/photo`). A receipt with no
   stored photograph answers not-found, which the ui reads as "no image".

   Public, because the url is minted into the VaultReceipt on chain: a wallet
   or an explorer rendering the object fetches it with no session of ours. The
   receipt key is the only thing guarding it, which is why it is a generated
   id rather than anything a stranger could guess from the listing. */
@Controller('receipts')
export class ReceiptPhotoController {
  constructor(private readonly store: ReceiptMetadataStore) {}

  @Public()
  @Get(':receiptKey/photo')
  async photo(@Param('receiptKey') receiptKey: string): Promise<StreamableFile> {
    const image = await this.store.readMainImage(receiptKey);
    if (image === null) {
      throw new NotFoundException('This receipt has no photograph');
    }
    return new StreamableFile(image.bytes, { type: image.mime });
  }
}
