import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { ChainDeploymentResponse } from '@depawn/contracts';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { readDeployment } from '../../infrastructure/chain/chain-deployment.registry';
import { Public } from '../shared/http/public.decorator';

/* The one read the self-custody wallet needs from the api: the coin type and
   the package that types the member's notes and receipt. Everything else the
   wallet reads straight from a full node. It answers from the recorded
   deployment row, so it works whether or not the settlement driver is on, and
   a process with nothing published yet says so with a 404 rather than a
   fabricated answer. */
@Controller('chain')
export class ChainDeploymentController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('deployment')
  async read(): Promise<ChainDeploymentResponse> {
    const deployment = await readDeployment(this.prisma);
    if (deployment === null) {
      throw new NotFoundException('No deployment has been published');
    }
    return {
      packageId: deployment.packageId,
      settlementCoinType: deployment.settlementCoinType,
      settlementCoinDecimals: deployment.settlementCoinDecimals,
      network: deployment.network,
    };
  }
}
