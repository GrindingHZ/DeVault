import type { SuiNetwork } from '../../config/chain-configuration';

/* The published package and the objects `init` created, as the publish
   script recorded them. Every builder takes one of these rather than reading
   configuration, which is what keeps the builders pure. */
export interface ChainDeployment {
  readonly network: SuiNetwork;
  readonly packageId: string;
  readonly configId: string;
  readonly adminCapId: string;
  readonly operatorCapId: string;
  readonly custodianCapId: string;
  /* The local stand in coin's mint authority; null on a public network,
     where USDC is Circle's and the float is the operator's own stock. */
  readonly treasuryCapId: string | null;
  readonly settlementCoinType: string;
  readonly settlementCoinDecimals: number;
  readonly publishedAt: Date;
  readonly publishedBy: string;
}

export class ChainDeploymentMissing extends Error {
  constructor(network: string) {
    super(
      `No package deployment is recorded for ${network}. Run pnpm chain:publish before starting with a chain driver.`,
    );
    this.name = 'ChainDeploymentMissing';
  }
}
