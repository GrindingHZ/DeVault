import { Module } from '@nestjs/common';
import { ChainDeploymentController } from './chain-deployment.controller';

/* Always in the graph, unlike the chain write modules, because the wallet
   reads the deployment to talk to the chain itself and must be able to whether
   or not this process holds an operator key. PrismaService comes from the
   global persistence module. */
@Module({
  controllers: [ChainDeploymentController],
})
export class ChainReadModule {}
