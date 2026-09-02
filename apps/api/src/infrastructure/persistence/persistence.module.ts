import { Global, Module } from '@nestjs/common';
import { isChainDriverEnabled, loadConfiguration } from '../../config/configuration';
import { UNIT_OF_WORK } from '../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../domain/ports/unit-of-work';
import { SuiUnitOfWork } from '../chain/sui-unit-of-work';
import { PrismaService } from './prisma.service';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

/* The chain unit of work is optional here because the chain module is only
   in the graph when a chain driver is on; asking for it while it is absent
   would be the configuration mistake the driver switch exists to name. */
function chooseUnitOfWork(prisma: PrismaUnitOfWork, sui: SuiUnitOfWork | undefined): UnitOfWork {
  if (!isChainDriverEnabled(loadConfiguration())) {
    return prisma;
  }
  if (sui === undefined) {
    throw new Error('A chain driver is on and the chain module is not in the application');
  }
  return sui;
}

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    {
      provide: UNIT_OF_WORK,
      useFactory: chooseUnitOfWork,
      inject: [PrismaUnitOfWork, { token: SuiUnitOfWork, optional: true }],
    },
  ],
  exports: [PrismaService, PrismaUnitOfWork, UNIT_OF_WORK],
})
export class PersistenceModule {}
