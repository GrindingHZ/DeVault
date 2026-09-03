import { Module } from '@nestjs/common';
import { readNetworkEndpoints } from '../../config/chain-configuration';
import { createReadOnlyChainClient } from '../../infrastructure/chain/chain-client';
import { ReceiptMetadataModule } from '../receipt-metadata/receipt-metadata.module';
import { ChainDeploymentController } from './chain-deployment.controller';
import { WALLET_READ_CLIENT } from './chain-read.tokens';
import { ListingsReadController } from './listings-read.controller';
import { ListingsReadService } from './listings-read.service';
import { LoansReadController } from './loans-read.controller';
import { LoansReadService } from './loans-read.service';
import { MarketReadController } from './market-read.controller';
import { MarketReadService } from './market-read.service';
import { MemberReadController } from './member-read.controller';
import { MemberReadService } from './member-read.service';
import { OffersReadController } from './offers-read.controller';
import { OffersReadService } from './offers-read.service';
import { PayoffReadController } from './payoff-read.controller';
import { ReleaseReadController } from './release-read.controller';
import { ReleaseReadService } from './release-read.service';
import { WalletReadController } from './wallet-read.controller';
import { WalletReadService } from './wallet-read.service';

/* Always in the graph, unlike the chain write modules, because the wallet reads
   the chain to show a member their money whether or not this process holds an
   operator key. Its client only reads, so it needs no key; PrismaService and
   the deployment row come from the global persistence module. */
@Module({
  imports: [ReceiptMetadataModule],
  controllers: [
    ChainDeploymentController,
    WalletReadController,
    ReleaseReadController,
    ListingsReadController,
    LoansReadController,
    OffersReadController,
    MarketReadController,
    MemberReadController,
    PayoffReadController,
  ],
  providers: [
    WalletReadService,
    ReleaseReadService,
    ListingsReadService,
    LoansReadService,
    OffersReadService,
    MarketReadService,
    MemberReadService,
    {
      provide: WALLET_READ_CLIENT,
      useFactory: () => createReadOnlyChainClient(readNetworkEndpoints()),
    },
  ],
})
export class ChainReadModule {}
