import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { ChainConfiguration, SuiNetwork } from '../../config/chain-configuration';
import { PrismaService } from '../persistence/prisma.service';
import { CHAIN_CONFIGURATION } from './chain.tokens';
import { ChainDeploymentMissing } from './chain-deployment';
import type { ChainDeployment } from './chain-deployment';

const activeDeploymentId = 'ACTIVE';

function networkOf(value: string): SuiNetwork {
  if (value === 'localnet' || value === 'testnet' || value === 'mainnet') {
    return value;
  }
  throw new Error(`The recorded deployment names an unknown network ${value}`);
}

/* Loaded once at boot and held in memory: every chain call needs the package
   id and the object ids, and a process talks to one deployment for its whole
   life. A chain driver with no deployment fails here, at boot, naming what
   is missing, rather than inside the first use case that reaches a port. */
@Injectable()
export class ChainDeploymentRegistry implements OnModuleInit {
  private deployment: ChainDeployment | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHAIN_CONFIGURATION) private readonly configuration: ChainConfiguration,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.current();
  }

  async reload(): Promise<void> {
    this.deployment = await readDeployment(this.prisma);
  }

  current(): ChainDeployment {
    if (this.deployment === null) {
      throw new ChainDeploymentMissing(this.configuration.network);
    }
    return this.deployment;
  }
}

export async function readDeployment(prisma: PrismaClient): Promise<ChainDeployment | null> {
  const row = await prisma.chainDeployment.findUnique({ where: { id: activeDeploymentId } });
  if (row === null) {
    return null;
  }
  return {
    network: networkOf(row.network),
    packageId: row.packageId,
    configId: row.configId,
    adminCapId: row.adminCapId,
    operatorCapId: row.operatorCapId,
    custodianCapId: row.custodianCapId,
    treasuryCapId: row.treasuryCapId,
    settlementCoinType: row.settlementCoinType,
    settlementCoinDecimals: row.settlementCoinDecimals,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
  };
}

export async function recordDeployment(
  prisma: PrismaClient,
  deployment: ChainDeployment,
): Promise<void> {
  const data = {
    network: deployment.network,
    packageId: deployment.packageId,
    configId: deployment.configId,
    adminCapId: deployment.adminCapId,
    operatorCapId: deployment.operatorCapId,
    custodianCapId: deployment.custodianCapId,
    treasuryCapId: deployment.treasuryCapId,
    settlementCoinType: deployment.settlementCoinType,
    settlementCoinDecimals: deployment.settlementCoinDecimals,
    publishedAt: deployment.publishedAt,
    publishedBy: deployment.publishedBy,
  };
  await prisma.chainDeployment.upsert({
    where: { id: activeDeploymentId },
    update: data,
    create: { id: activeDeploymentId, ...data },
  });
}
