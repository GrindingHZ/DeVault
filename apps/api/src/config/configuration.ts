export type SettlementDriver = 'ledger' | 'chain';
export type CustodyDriver = 'database' | 'chain';
export type StorageDriver = 'filesystem' | 'supabase';

export interface Configuration {
  readonly httpPort: number;
  readonly databaseUrl: string;
  readonly storageDirectory: string;
  /* Where item photographs live. A host with an ephemeral disk loses them on
     every deploy, so anything but a developer's machine wants the bucket. */
  readonly storageDriver: StorageDriver;
  /* The origin a browser reaches this api on. It is written into every receipt
     minted on chain, where nothing can correct it afterwards. */
  readonly publicBaseUrl: string;
  readonly settlementDriver: SettlementDriver;
  readonly custodyDriver: CustodyDriver;
  /* The wallet addresses the platform has authorised as vault staff. A wallet
     here signs in to the custodian console; every other wallet is a member.
     Config, not a row, so a database reset never revokes a custodian: the
     authority lives with the operator, not in the data. */
  readonly custodianWalletAddresses: readonly string[];
}

/* A driver switch that is set to something unexpected is a deployment mistake,
   and the safest moment to find out is boot, before any use case has run
   against the wrong adapter. */
function driverFrom<T extends string>(variable: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[variable];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const match = allowed.find((candidate) => candidate === raw);
  if (match === undefined) {
    throw new Error(`${variable} must be one of ${allowed.join(', ')}, got ${raw}`);
  }
  return match;
}

function addressesFrom(variable: string): string[] {
  const raw = process.env[variable];
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address.length > 0);
}

export function loadConfiguration(): Configuration {
  return {
    httpPort: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://depawn:depawn@localhost:5433/depawn',
    storageDirectory: process.env.STORAGE_DIRECTORY ?? 'var/storage',
    settlementDriver: driverFrom('SETTLEMENT_DRIVER', ['ledger', 'chain'], 'ledger'),
    custodyDriver: driverFrom('CUSTODY_DRIVER', ['database', 'chain'], 'database'),
    storageDriver: driverFrom('STORAGE_DRIVER', ['filesystem', 'supabase'], 'filesystem'),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    custodianWalletAddresses: addressesFrom('CUSTODIAN_WALLET_ADDRESSES'),
  };
}

/* Either port on the chain needs a transaction builder carried by the unit of
   work, and the Prisma adapters keep working through that context, so one
   answer serves the whole process. */
export function isChainDriverEnabled(configuration: Configuration): boolean {
  return configuration.settlementDriver === 'chain' || configuration.custodyDriver === 'chain';
}
