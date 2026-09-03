import { Module } from '@nestjs/common';
import { ReceiptMetadataController } from './receipt-metadata.controller';
import { ReceiptMetadataStore } from './receipt-metadata.store';
import { ReceiptPhotoController } from './receipt-photo.controller';

/* Always in the graph: reading a receipt's name and photographs needs no chain
   driver or operator key, only the object store the platform services module
   provides. The custodian issue flow imports it to write; everyone reads. */
@Module({
  controllers: [ReceiptMetadataController, ReceiptPhotoController],
  providers: [ReceiptMetadataStore],
  exports: [ReceiptMetadataStore],
})
export class ReceiptMetadataModule {}
