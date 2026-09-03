import { Global, Module } from '@nestjs/common';
import { loadChainConfiguration } from '../../config/chain-configuration';
import type { ChainConfiguration } from '../../config/chain-configuration';
import { SuiCustodyAdapter } from '../custody/sui-custody.adapter';
import { SuiDomainEventPublisher } from '../events/sui-domain-event-publisher';
import { SuiProtocolParametersAdapter } from '../parameters/sui-protocol-parameters.adapter';
import { SuiSystemStateAdapter } from '../system-state/sui-system-state.adapter';
import { PersistenceModule } from '../persistence/persistence.module';
import { SuiSettlementAdapter } from '../settlement/sui-settlement.adapter';
import { ACCOUNT_REPOSITORY } from '../../domain/accounts/account-repository';
import { PrismaAccountRepository } from '../persistence/repositories/prisma-account.repository';
import { AccountAddressDirectory } from './account-address.directory';
import { createChainClient } from './chain-client';
import type { ChainClient } from './chain-client';
import { ChainDeploymentRegistry } from './chain-deployment.registry';
import { GrpcChainSubmitter } from './chain-submitter';
import { CHAIN_CLIENT, CHAIN_CONFIGURATION, CHAIN_SUBMITTER } from './chain.tokens';
import { ChainEventIndexer } from './indexer/chain-event.indexer';
import { ChainReconciliation } from './indexer/chain-reconciliation';
import { OperatorSigner } from './operator-signer';
import { SuiUnitOfWork } from './sui-unit-of-work';
import { WalletDirectory } from './wallet.directory';

/* Imported by the application only when a chain driver is on, so a Phase 1
   process never reads a chain variable or opens a connection to a node. */
@Global()
@Module({
  imports: [PersistenceModule],
  providers: [
    { provide: CHAIN_CONFIGURATION, useFactory: loadChainConfiguration },
    {
      provide: CHAIN_CLIENT,
      useFactory: (configuration: ChainConfiguration) => createChainClient(configuration),
      inject: [CHAIN_CONFIGURATION],
    },
    {
      provide: OperatorSigner,
      useFactory: (configuration: ChainConfiguration) => new OperatorSigner(configuration),
      inject: [CHAIN_CONFIGURATION],
    },
    {
      provide: CHAIN_SUBMITTER,
      useFactory: (client: ChainClient, signer: OperatorSigner) =>
        new GrpcChainSubmitter(client, signer),
      inject: [CHAIN_CLIENT, OperatorSigner],
    },
    ChainDeploymentRegistry,
    PrismaAccountRepository,
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    AccountAddressDirectory,
    WalletDirectory,
    SuiUnitOfWork,
    SuiSettlementAdapter,
    SuiCustodyAdapter,
    SuiSystemStateAdapter,
    SuiProtocolParametersAdapter,
    SuiDomainEventPublisher,
    ChainEventIndexer,
    ChainReconciliation,
  ],
  exports: [
    CHAIN_CONFIGURATION,
    CHAIN_CLIENT,
    CHAIN_SUBMITTER,
    OperatorSigner,
    ChainDeploymentRegistry,
    AccountAddressDirectory,
    WalletDirectory,
    SuiUnitOfWork,
    SuiSettlementAdapter,
    SuiCustodyAdapter,
    SuiSystemStateAdapter,
    SuiProtocolParametersAdapter,
    SuiDomainEventPublisher,
    ChainEventIndexer,
    ChainReconciliation,
  ],
})
export class ChainModule {}
