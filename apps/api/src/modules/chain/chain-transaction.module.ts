import { Module } from '@nestjs/common';
import type { ChainClient } from '../../infrastructure/chain/chain-client';
import { ChainModule } from '../../infrastructure/chain/chain.module';
import { CHAIN_CLIENT } from '../../infrastructure/chain/chain.tokens';
import { GrpcSponsoredTransactionGateway } from '../../infrastructure/chain/grpc-sponsored-transaction';
import { OperatorSigner } from '../../infrastructure/chain/operator-signer';
import { SPONSORED_TRANSACTION_GATEWAY } from '../../infrastructure/chain/sponsored-transaction';
import { ChainTransactionController } from './chain-transaction.controller';
import { ChainTransactionService } from './chain-transaction.service';
import { CustodianReceiptController } from './custodian-receipt.controller';
import { CustodianReceiptService } from './custodian-receipt.service';

/* The member facing chain write surface. Present only when a chain driver is
   on, because it is the whole of the self-custody flow and has nothing to do
   in a database only process. */
@Module({
  imports: [ChainModule],
  controllers: [ChainTransactionController, CustodianReceiptController],
  providers: [
    ChainTransactionService,
    CustodianReceiptService,
    {
      provide: SPONSORED_TRANSACTION_GATEWAY,
      useFactory: (client: ChainClient, signer: OperatorSigner): GrpcSponsoredTransactionGateway =>
        new GrpcSponsoredTransactionGateway(client, signer),
      inject: [CHAIN_CLIENT, OperatorSigner],
    },
  ],
})
export class ChainTransactionModule {}
