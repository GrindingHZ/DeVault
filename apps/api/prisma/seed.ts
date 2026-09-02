import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { ulid } from 'ulid';
import { loadConfiguration } from '../src/config/configuration';
import { solidPng } from '../src/infrastructure/storage/solid-png';

export const demoPassword = 'demo-password-123';

const staffEmail = 'staff@demo.test';
const operationsEmail = 'ops@demo.test';
const vaultId = 'VAULT-DEMO-1';
const oneDay = 24 * 60 * 60 * 1000;

const demoAccounts = [
  { email: 'member@demo.test', roles: ['MEMBER'] },
  { email: 'lender@demo.test', roles: ['MEMBER'] },
  { email: staffEmail, roles: ['VAULT_STAFF'] },
  { email: operationsEmail, roles: ['OPERATIONS'] },
  { email: 'compliance@demo.test', roles: ['COMPLIANCE'] },
] as const;

/* Everyone the story needs, beyond the five fixed accounts the e2e suite
   signs in as. Each has one job so the runbook can name them. */
const cast = {
  ada: 'ada@demo.test',
  bruno: 'bruno@demo.test',
  chen: 'chen@demo.test',
  dara: 'dara@demo.test',
  elena: 'elena@demo.test',
  farid: 'farid@demo.test',
  gita: 'gita@demo.test',
} as const;

/* One of each category the vault takes, so the demo shows the loan to value
   caps actually differing rather than five rows of gold. The tint stands in
   for a photograph: the seed generates a real PNG per item, because the
   upload check verifies the bytes and would refuse anything else.

   Every item is a thing somebody could actually walk into a shop with, named
   the way they would say it. What tells one Rolex from another lives on the
   serial, where a person looks it up, rather than in a description every
   screen then has to wrap over two lines. */
interface Item {
  readonly description: string;
  readonly category: 'BULLION' | 'WATCH' | 'JEWELLERY' | 'COLLECTIBLE' | 'ART';
  readonly appraisedMinorUnits: string;
  readonly tint: readonly [number, number, number];
  /* Comfortably inside the category cap, so the demo never has to explain a
     refusal it did not mean to show. */
  readonly askMinorUnits: string;
  /* What the appraiser did and what they compared against. A valuation with
     no method behind it is a number somebody made up, and the vault console
     shows both. */
  readonly appraisalMethod: string;
  readonly comparableReferences: string;
  /* What distinguishes this one from another of the same model. Recorded on
     the intake, which is what the seal is sealed over. */
  readonly serialNumbers: readonly string[];
}

/* Position is a contract, not an ordering. buildDataset reads this list by
   index: 0 is borrowed, repaid and walked back out; 1 defaults and goes to
   sale against a reserve of USD 1,500; 2 to 4 carry the running loans;
   everything from 5 on stays on the marketplace taking offers. Moving an
   entry moves the story it is in, so add at the end rather than reordering.

   Named the way somebody would say it out loud at the counter. An earlier
   pass used full catalogue references, which read as a spreadsheet on every
   screen that listed more than three of them; the reference number still
   exists, on the serial. */
const items: readonly Item[] = [
  {
    /* Position 0: the completed cycle. Somebody bridging a few weeks who
       means to come back for it. */
    description: 'Gold Coin',
    category: 'BULLION',
    appraisedMinorUnits: '520000',
    askMinorUnits: '250000',
    appraisalMethod: 'spot price at appraisal against 999.9 assay',
    comparableReferences: 'COMEX published spot, plus retail premium',
    serialNumbers: ['PM-2024-AU1-0084213'],
    tint: [212, 175, 84],
  },
  {
    /* Position 1: defaults and is sold. Priced so the reserve of USD 1,500
       and the bids of USD 1,800 and 2,100 read as a real result. */
    description: 'Signed Print',
    category: 'ART',
    appraisedMinorUnits: '380000',
    askMinorUnits: '100000',
    appraisalMethod: 'edition comparables, condition inspected unframed',
    comparableReferences: 'three comparable lots cleared at auction in 90 days',
    serialNumbers: ['SBM-MAR-11-0442'],
    tint: [198, 92, 132],
  },
  {
    /* Positions 2 to 4: the running loans, at 14, 45 and 90 days. */
    description: 'Rolex Watch',
    category: 'WATCH',
    appraisedMinorUnits: '1950000',
    askMinorUnits: '600000',
    appraisalMethod: 'comparable sales, full set, movement within tolerance',
    comparableReferences: 'sold listings, 90 day median for a full set',
    serialNumbers: ['CASE-9K42L118', 'MOVEMENT-3235-77219'],
    tint: [58, 68, 78],
  },
  {
    description: 'Gold Bracelet',
    category: 'JEWELLERY',
    appraisedMinorUnits: '1140000',
    askMinorUnits: '350000',
    appraisalMethod: 'assay verified, hallmark and certificate present',
    comparableReferences: 'replacement cost less 30 percent for a worn example',
    serialNumbers: ['CRT-LV17-QK4482'],
    tint: [198, 160, 92],
  },
  {
    description: 'Pokemon Card',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '890000',
    askMinorUnits: '250000',
    appraisalMethod: 'graded population and recent cleared sales',
    comparableReferences: 'population report, 11 sales at this grade in 6 months',
    serialNumbers: ['PSA-98412236'],
    tint: [196, 106, 62],
  },
  {
    /* Position 5 on: live on the marketplace, taking offers. */
    description: 'Gold Bar',
    category: 'BULLION',
    appraisedMinorUnits: '1680000',
    askMinorUnits: '700000',
    appraisalMethod: 'spot price at appraisal, assay card intact and matching',
    comparableReferences: 'COMEX published spot, plus bar premium',
    serialNumbers: ['PAMP-C401882'],
    tint: [216, 182, 96],
  },
  {
    description: 'Omega Watch',
    category: 'WATCH',
    appraisedMinorUnits: '1100000',
    askMinorUnits: '400000',
    appraisalMethod: 'comparable sales, box and papers present',
    comparableReferences: 'sold listings, 90 day median for a full set',
    serialNumbers: ['CASE-88214477'],
    tint: [88, 96, 104],
  },
  {
    description: 'Diamond Ring',
    category: 'JEWELLERY',
    appraisedMinorUnits: '1260000',
    askMinorUnits: '450000',
    appraisalMethod: 'certificate verified against the stone, setting inspected',
    comparableReferences: 'comparable G VS1 round brilliants at auction',
    serialNumbers: ['GIA-2185640021'],
    tint: [138, 190, 190],
  },
  {
    description: 'Chanel Bag',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '950000',
    askMinorUnits: '300000',
    appraisalMethod: 'authenticated, hardware and stitching inspected',
    comparableReferences: 'resale platform sold listings, same leather and size',
    serialNumbers: ['CHN-28114906'],
    tint: [162, 118, 92],
  },
  {
    description: 'Silver Bar',
    category: 'BULLION',
    appraisedMinorUnits: '320000',
    askMinorUnits: '150000',
    appraisalMethod: 'spot price at appraisal against 999 assay',
    comparableReferences: 'published spot, plus bar premium',
    serialNumbers: ['PM-2023-AG10-4471'],
    tint: [176, 184, 192],
  },
  {
    description: 'Pearl Necklace',
    category: 'JEWELLERY',
    appraisedMinorUnits: '680000',
    askMinorUnits: '250000',
    appraisalMethod: 'graded for lustre and matching, clasp assayed',
    comparableReferences: 'comparable Akoya strands at auction',
    serialNumbers: ['PRL-88-0192'],
    tint: [222, 214, 200],
  },
  {
    description: 'Oil Painting',
    category: 'ART',
    appraisedMinorUnits: '720000',
    askMinorUnits: '200000',
    appraisalMethod: 'attributed, canvas and frame inspected unglazed',
    comparableReferences: 'two comparable works by the same hand at auction',
    serialNumbers: [],
    tint: [120, 96, 74],
  },
];

/* The rest of the catalogue, kept terse on purpose. Everything above is
   written out because the runbook names those items; these exist so every
   state a screen can be in has something real sitting in it, and an appraisal
   method is a property of the category rather than of the individual object,
   so it is written once per category rather than thirty times. */
const methodsByCategory: Record<
  Item['category'],
  Pick<Item, 'appraisalMethod' | 'comparableReferences'>
> = {
  BULLION: {
    appraisalMethod: 'spot price at appraisal against the stamped assay',
    comparableReferences: 'published spot, plus the premium the form carries',
  },
  WATCH: {
    appraisalMethod: 'comparable sales, movement and case inspected',
    comparableReferences: 'sold listings, 90 day median for this reference',
  },
  JEWELLERY: {
    appraisalMethod: 'stones certificated, metal assayed, setting inspected',
    comparableReferences: 'auction results for comparable stones and metal weight',
  },
  COLLECTIBLE: {
    appraisalMethod: 'authenticated and graded, condition photographed',
    comparableReferences: 'graded population report and recent cleared sales',
  },
  ART: {
    appraisalMethod: 'attribution checked, condition inspected unframed',
    comparableReferences: 'comparable lots cleared at auction within a year',
  },
};

interface TerseItem {
  readonly description: string;
  readonly category: Item['category'];
  readonly appraisedMinorUnits: string;
  readonly askMinorUnits: string;
  readonly serial: string;
  readonly tint: readonly [number, number, number];
}

const terseItems: readonly TerseItem[] = [
  {
    description: 'Krugerrand Set',
    category: 'BULLION',
    appraisedMinorUnits: '740000',
    askMinorUnits: '400000',
    serial: 'PM-2022-AU-77120',
    tint: [206, 168, 78],
  },
  {
    description: 'Platinum Bar',
    category: 'BULLION',
    appraisedMinorUnits: '980000',
    askMinorUnits: '520000',
    serial: 'PM-2021-PT-30188',
    tint: [188, 192, 198],
  },
  {
    description: 'Silver Coin Roll',
    category: 'BULLION',
    appraisedMinorUnits: '260000',
    askMinorUnits: '120000',
    serial: 'PM-2020-AG-99031',
    tint: [172, 178, 186],
  },
  {
    description: 'Cartier Tank',
    category: 'WATCH',
    appraisedMinorUnits: '1420000',
    askMinorUnits: '520000',
    serial: 'CASE-CT-4471902',
    tint: [70, 76, 88],
  },
  {
    description: 'Tudor Diver',
    category: 'WATCH',
    appraisedMinorUnits: '860000',
    askMinorUnits: '340000',
    serial: 'CASE-TD-2210447',
    tint: [52, 66, 84],
  },
  {
    description: 'Grand Seiko',
    category: 'WATCH',
    appraisedMinorUnits: '1080000',
    askMinorUnits: '420000',
    serial: 'CASE-GS-9F86112',
    tint: [96, 102, 110],
  },
  {
    description: 'Sapphire Pendant',
    category: 'JEWELLERY',
    appraisedMinorUnits: '690000',
    askMinorUnits: '260000',
    serial: 'GIA-4471120884',
    tint: [96, 128, 190],
  },
  {
    description: 'Emerald Studs',
    category: 'JEWELLERY',
    appraisedMinorUnits: '540000',
    askMinorUnits: '200000',
    serial: 'GIA-2210049971',
    tint: [96, 168, 128],
  },
  {
    description: 'Signet Ring',
    category: 'JEWELLERY',
    appraisedMinorUnits: '310000',
    askMinorUnits: '120000',
    serial: 'HM-LON-88214',
    tint: [198, 166, 96],
  },
  {
    description: 'Rookie Card',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '1240000',
    askMinorUnits: '400000',
    serial: 'PSA-77120448',
    tint: [184, 112, 74],
  },
  {
    description: 'First Edition',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '470000',
    askMinorUnits: '160000',
    serial: 'ISBN-0-7475-3269-9',
    tint: [148, 122, 96],
  },
  {
    description: 'Vintage Camera',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '380000',
    askMinorUnits: '120000',
    serial: 'LEI-M3-0784412',
    tint: [88, 90, 94],
  },
  {
    description: 'Bronze Study',
    category: 'ART',
    appraisedMinorUnits: '820000',
    askMinorUnits: '240000',
    serial: 'FND-88-0412',
    tint: [142, 108, 76],
  },
  {
    description: 'Ink Drawing',
    category: 'ART',
    appraisedMinorUnits: '290000',
    askMinorUnits: '80000',
    serial: 'STU-DR-1188',
    tint: [176, 172, 164],
  },
  {
    description: 'Silkscreen Print',
    category: 'ART',
    appraisedMinorUnits: '640000',
    askMinorUnits: '180000',
    serial: 'ED-44-OF-120',
    tint: [206, 96, 108],
  },
  {
    description: 'Gold Chain',
    category: 'JEWELLERY',
    appraisedMinorUnits: '450000',
    askMinorUnits: '170000',
    serial: 'HM-MIL-77410',
    tint: [204, 172, 90],
  },
  {
    description: 'Omega Constellation',
    category: 'WATCH',
    appraisedMinorUnits: '620000',
    askMinorUnits: '240000',
    serial: 'CASE-OC-1180922',
    tint: [78, 84, 92],
  },
  {
    description: 'Proof Sovereign',
    category: 'BULLION',
    appraisedMinorUnits: '350000',
    askMinorUnits: '160000',
    serial: 'PM-2019-AU-11284',
    tint: [214, 180, 92],
  },
  {
    description: 'Art Deco Brooch',
    category: 'JEWELLERY',
    appraisedMinorUnits: '580000',
    askMinorUnits: '210000',
    serial: 'GIA-9902114477',
    tint: [150, 160, 190],
  },
  {
    description: 'Comic Issue One',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '910000',
    askMinorUnits: '300000',
    serial: 'CGC-2011478',
    tint: [190, 130, 90],
  },
  {
    description: 'Watercolour Coast',
    category: 'ART',
    appraisedMinorUnits: '340000',
    askMinorUnits: '95000',
    serial: 'STU-WC-4471',
    tint: [130, 168, 186],
  },
];

const catalogue: readonly Item[] = [
  ...items,
  ...terseItems.map((terse) => ({
    description: terse.description,
    category: terse.category,
    appraisedMinorUnits: terse.appraisedMinorUnits,
    askMinorUnits: terse.askMinorUnits,
    serialNumbers: [terse.serial],
    tint: terse.tint,
    ...methodsByCategory[terse.category],
  })),
];

/* The seed drives the same HTTP surface the three apps drive rather than
   writing rows. A seed that wrote rows would encode today's shape of the
   schema and would rot the first time a rule changed; this one cannot produce
   a state the product could not have reached by itself. */
class DemoClient {
  private cookie = '';

  constructor(private readonly origin: string) {}

  async call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.origin}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        ...(this.cookie === '' ? {} : { cookie: this.cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) {
      this.cookie = setCookie.split(';')[0] ?? this.cookie;
    }
    const text = await response.text();
    if (response.status >= 400) {
      throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
    }
    return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  }

  async uploadPhoto(intakeId: string, bytes: Buffer): Promise<void> {
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'front.png');
    const response = await fetch(`${this.origin}/api/v1/intakes/${intakeId}/photos`, {
      method: 'POST',
      headers: this.cookie === '' ? {} : { cookie: this.cookie },
      body: form,
    });
    if (response.status >= 400) {
      throw new Error(`photo upload answered ${response.status}: ${await response.text()}`);
    }
  }

  async signIn(email: string, secret: string): Promise<void> {
    await this.call('POST', '/auth/login', { email, password: secret });
  }
}

/* The seed wipes what it finds, so it refuses to run against anything that
   looks like it is not a development or demo database. A wrong DATABASE_URL
   is the one mistake this script could make that could not be undone. */
function refuseToWipeAnythingImportant(databaseUrl: string): void {
  const host = new URL(databaseUrl).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal && process.env.SEED_ANY_DATABASE !== 'true') {
    throw new Error(
      `refusing to empty a database on ${host}. The seed only ever runs locally; ` +
        'set SEED_ANY_DATABASE=true if you truly mean a remote one.',
    );
  }
}

/* The database and the blob store have to be emptied together. Emptying only
   the tables leaves every photograph any previous run wrote sitting on disk
   with nothing pointing at it, which after a few dozen runs is most of what
   is in there. */
async function emptyStoredObjects(storageDirectory: string): Promise<void> {
  await rm(path.resolve(storageDirectory, 'intakes'), { recursive: true, force: true });
}

async function emptyEveryTable(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) {
    return;
  }
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
}

function identifierOf(payload: Record<string, unknown>): string {
  const id = payload.id;
  if (typeof id !== 'string') {
    throw new Error('the api must answer a created resource with an id');
  }
  return id;
}

/* Every deadline in the dataset is measured against the api's clock, not the
   seed's. They part company the moment the seed advances time, and a listing
   dated from the seed's own clock would be born already expired. */
/* How far the story runs from its first day to its last. The seed starts the
   clock this far in the past and plays forward, so the demo finishes at
   roughly the real today rather than months beyond it.

   Running forward from now was the obvious thing and it read badly: the
   richer the story got, the further into the future the demo landed, until
   every date on every screen was a season away from the reader's own. The
   clock still only ever moves forwards while the api is running (flow 15);
   the rewind is a single write the seed makes to an empty table before the
   process that reads it has started. */
const storyLengthDays = 123;

let clockOffsetMs = -storyLengthDays * oneDay;

function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

function money(minorUnits: string): { minorUnits: string; currency: 'USD' } {
  return { minorUnits, currency: 'USD' };
}

/* The end to end suite wants the fixed accounts and the vault and nothing
   else: its specs build their own data, and a loan book dated against a clock
   that suite does not run would only confuse it. A demo wants the whole
   story. One script, two scopes, so there is only ever one place that knows
   what a demo account is called. */
const accountsOnly = process.argv.includes('--accounts-only');

/* For a container that starts on every `docker compose up`. Seeding an empty
   database is helpful; emptying a full one because the stack restarted is
   not, and belongs behind a deliberate `pnpm db:seed`. */
const onlyIfEmpty = process.argv.includes('--if-empty');

async function main(): Promise<void> {
  process.env.DEMO_MODE = 'true';
  const configuration = loadConfiguration();
  const prisma = new PrismaClient({ datasourceUrl: configuration.databaseUrl });

  if (onlyIfEmpty && (await prisma.account.count()) > 0) {
    process.stdout.write('the database already has accounts, so the seed left it alone\n');
    await prisma.$disconnect();
    return;
  }
  refuseToWipeAnythingImportant(configuration.databaseUrl);

  /* The dataset is a story with a fixed cast, so it starts from an empty
     database. Seeding on top of a previous run would double the loan book
     and leave the runbook describing a screen nobody can reproduce. */
  await emptyEveryTable(prisma);
  /* Written before the api boots, because the clock adapter reads this row
     once at startup and holds it. */
  await prisma.demoClock.upsert({
    where: { id: 'DEMO' },
    create: { id: 'DEMO', offsetMs: BigInt(clockOffsetMs) },
    update: { offsetMs: BigInt(clockOffsetMs) },
  });
  await emptyStoredObjects(configuration.storageDirectory);
  const passwordHash = await hash(demoPassword);

  for (const account of demoAccounts) {
    await prisma.account.upsert({
      where: { email: account.email },
      update: { roles: [...account.roles] },
      create: { id: ulid(), email: account.email, passwordHash, roles: [...account.roles] },
    });
  }

  await prisma.vault.upsert({
    where: { id: vaultId },
    update: {},
    create: {
      id: vaultId,
      name: 'New York vault',
      city: 'New York',
      insuredLimitMinorUnits: 100_000_000n,
      currency: 'USD',
    },
  });

  if (accountsOnly) {
    await prisma.$disconnect();
    process.stdout.write('seeded the demo accounts and the New York vault\n');
    return;
  }

  // Imported here so the demo mode flag above is already set when the graph
  // decides which clock it runs.
  const { NestFactory } = await import('@nestjs/core');
  const cookieParser = (await import('cookie-parser')).default;
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create(AppModule.forRuntime());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.listen(0);
  const origin = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  process.stdout.write(`listening on ${origin}
`);
  try {
    await buildDataset(origin);
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

interface Receipt {
  readonly id: string;
  readonly borrower: string;
  readonly ask: string;
}

const member = 'member@demo.test';
const secondLender = 'lender@demo.test';

/* The whole story, told forwards, because the demo clock only runs that way.

   It is written as a timeline rather than as a list of fixtures for one
   reason: almost every state worth showing is one that something reaches by
   ageing. A loan halfway through its term, a hold that lost and was never
   reclaimed, a sale voided by the repayment that landed under it, a wallet
   whose balance actually moves: none of these can be written down, they have
   to be lived through. The offsets below are therefore chosen backwards from
   where the story should end, and executed forwards.

   Everything member@demo.test owns is deliberate. That account is what the
   runbook signs in as, and it used to own nothing at all: the entire loan
   book belonged to the cast, so the first screen a reader saw was empty. It
   now holds both sides of the market, which is what the product says an
   account is anyway (Q-028). */
async function buildDataset(origin: string): Promise<void> {
  const clock = new DemoClient(origin);
  const staff = new DemoClient(origin);
  const operations = new DemoClient(origin);

  /* The cast only. The five fixed accounts are upserted before the api is
     even started, and registering one of those again is a conflict. */
  for (const email of Object.values(cast)) {
    await new DemoClient(origin).call('POST', '/auth/register', { email, password: demoPassword });
  }
  await staff.signIn(staffEmail, demoPassword);
  await operations.signIn(operationsEmail, demoPassword);
  const staffAndOperations = [
    [staff, staffEmail],
    [operations, operationsEmail],
  ] as const;

  /* Who holds what. The reader's own items come first so the story can name
     them by position, then the cast's, which are what the reader lends
     against and browses. */
  const castOwners = [
    cast.ada,
    cast.bruno,
    cast.chen,
    cast.dara,
    cast.elena,
    cast.farid,
    cast.gita,
  ];
  const owners: readonly string[] = [
    ...Array.from({ length: 16 }, () => member),
    ...Array.from(
      { length: 17 },
      (_unused, index) => castOwners[index % castOwners.length] ?? cast.ada,
    ),
  ];
  const receipts: Receipt[] = [];
  for (const [index, item] of catalogue.entries()) {
    const owner = owners[index] ?? cast.ada;
    receipts.push({
      id: await issueReceipt(staff, owner, item),
      borrower: owner,
      ask: item.askMinorUnits,
    });
  }
  const at = (index: number): Receipt => {
    const receipt = receipts[index];
    if (receipt === undefined) {
      throw new Error(`the seed expects a receipt at position ${String(index)}`);
    }
    return receipt;
  };

  /* Enough for everyone to play their part with room to spare. The reader
     gets the most because they are on both sides of eleven loans. */
  for (const email of Object.values(cast)) {
    await operations.call('POST', '/me/deposits', { email, amount: money('6000000') });
  }
  await operations.call('POST', '/me/deposits', { email: secondLender, amount: money('4000000') });
  await operations.call('POST', '/me/deposits', { email: member, amount: money('8000000') });

  /* Day zero. The oldest things in the book, so the wallet has somewhere to
     start and the longest chart window has something in it. */
  const collected = await originateBetween(origin, at(0), cast.ada, 1800, 30);
  const settledLending = await originateBetween(origin, at(16), member, 2000, 30);

  /* A hold that is about to lose. Refunds are pull and not push, so this is
     the money nobody ever finds until the bell points at it (flow 9). */
  const contested = await publishListing(origin, at(17), 21, 2600);
  await placeOffer(origin, contested, member, 2400);

  await advance(clock, oneDay, staffAndOperations);
  await placeOffer(origin, contested, cast.elena, 1900);
  await acceptBest(origin, at(17).borrower, contested);

  await advance(clock, 4 * oneDay, staffAndOperations);
  // A withdrawal, so the capital line has a step down in it as well as up.
  await withdrawCash(origin, member, '500000');

  await advance(clock, 25 * oneDay, staffAndOperations);
  await repay(origin, collected);
  await redeem(origin, staff, collected.borrower, at(0).id);

  await advance(clock, 5 * oneDay, staffAndOperations);
  await repay(origin, settledLending);

  /* Day forty. Loans that will not be repaid, so the book has defaults on
     both sides of it and the wallet grows a band for money at risk. */
  await advance(clock, 5 * oneDay, staffAndOperations);
  await operations.call('POST', '/me/deposits', { email: member, amount: money('2000000') });
  const claimable = await originateBetween(origin, at(18), member, 2400, 14);
  const claimed = await originateBetween(origin, at(19), member, 2400, 14);
  const lentAndSold = await originateBetween(origin, at(20), member, 2200, 14);
  const lostToLender = await originateBetween(origin, at(3), cast.gita, 2400, 14);
  const lostToSale = await originateBetween(origin, at(4), cast.dara, 2200, 14);

  /* Day sixty two, past maturity and past grace on all five. */
  await advance(clock, 22 * oneDay, staffAndOperations);
  await markDefaulted(origin, member, claimable.loanId);
  await markDefaulted(origin, member, claimed.loanId);
  await claimCollateral(origin, member, claimed.loanId);
  await markDefaulted(origin, member, lentAndSold.loanId);
  await markDefaulted(origin, cast.gita, lostToLender.loanId);
  await claimCollateral(origin, cast.gita, lostToLender.loanId);
  await markDefaulted(origin, cast.dara, lostToSale.loanId);

  /* Day eighty. The loans that have to be past their grace by the end are
     the oldest of the ones still running, so they are written first. */
  await advance(clock, 18 * oneDay, staffAndOperations);
  await originateBetween(origin, at(5), cast.ada, 1600, 30);
  await originateBetween(origin, at(21), member, 2100, 30);

  await advance(clock, 7 * oneDay, staffAndOperations);
  await originateBetween(origin, at(6), cast.bruno, 1700, 30);

  await advance(clock, 5 * oneDay, staffAndOperations);
  await originateBetween(origin, at(22), member, 2300, 30);

  /* Day ninety three. The statutory holding period has run on the day sixty
     two defaults, so two sales can settle, and one is left taking bids. */
  await advance(clock, oneDay, staffAndOperations);
  await liquidate(origin, operations, lostToSale.loanId, '150000', ['180000', '210000'], true);
  await liquidate(origin, operations, lentAndSold.loanId, '120000', ['140000', '165000'], true);
  await liquidate(origin, operations, claimable.loanId, '130000', ['150000'], false);

  await advance(clock, 4 * oneDay, staffAndOperations);
  const lentMidway = await originateBetween(origin, at(23), member, 1900, 45);

  await advance(clock, 3 * oneDay, staffAndOperations);
  // A fortnight on it, so it is past its closing date by the end.
  await publishListing(origin, at(7), 30, 2400, 14);

  await advance(clock, 5 * oneDay, staffAndOperations);
  await operations.call('POST', '/me/deposits', { email: member, amount: money('1000000') });

  /* Everything that has to still be running at the end, placed so it lands
     where the story wants it: halfway, due tomorrow, barely started. */
  await advance(clock, 5 * oneDay, staffAndOperations);
  await originateBetween(origin, at(8), cast.chen, 1800, 30);

  await advance(clock, 2 * oneDay, staffAndOperations);
  await originateBetween(origin, at(9), cast.elena, 2000, 14);

  await advance(clock, 3 * oneDay, staffAndOperations);
  const soldPosition = await originateBetween(origin, at(24), member, 2000, 30);
  const withdrawnPosition = await originateBetween(origin, at(25), member, 2000, 30);
  const voidedPosition = await originateBetween(origin, at(26), member, 2000, 14);
  const soldSale = await listPositionForSale(origin, soldPosition, 97n);
  await purchasePosition(origin, cast.chen, soldSale);
  const withdrawnSale = await listPositionForSale(origin, withdrawnPosition, 96n);
  await withdrawPositionSale(origin, withdrawnPosition, withdrawnSale);
  await listPositionForSale(origin, voidedPosition, 98n);

  await advance(clock, 7 * oneDay, staffAndOperations);
  const lentEarly = await originateBetween(origin, at(27), member, 1700, 90);

  await advance(clock, oneDay, staffAndOperations);
  // Repaying under an open sale is what voids it (flow 18).
  await repay(origin, voidedPosition);
  await originateBetween(origin, at(10), cast.farid, 1500, 90);

  /* The position on the market has run three weeks of its forty five, so the
     principal and what it is worth today are far enough apart to draw. */
  await listPositionForSale(origin, lentMidway, 97n);
  await listPositionForSale(origin, lentEarly, 98n);

  /* The live marketplace, published last so nothing here has aged out: one
     with a book on it, one nobody has offered on, one closing within the
     day, one the reader cancelled, and one never published at all. */
  const busy = await publishListing(origin, at(11), 30, 2400);
  await placeOffer(origin, busy, cast.ada, 2200);
  await placeOffer(origin, busy, cast.bruno, 1950);
  await placeOffer(origin, busy, secondLender, 1800);
  await publishListing(origin, at(12), 45, 2600);
  await publishListing(origin, at(13), 21, 2500, 1);
  const cancelled = await publishListing(origin, at(14), 30, 2400);
  await cancelListing(origin, at(14).borrower, cancelled);
  await draftListing(origin, at(15), 30, 2400);

  /* Other people's listings, which is what the reader browses, and two
     offers of the reader's own left standing on them. */
  for (const [index, receiptIndex] of [28, 29, 30, 31, 32].entries()) {
    const listing = await publishListing(origin, at(receiptIndex), 30 + index * 15, 2400);
    await placeOffer(origin, listing, cast.farid, 2100 - index * 50);
    if (index < 2) {
      await placeOffer(origin, listing, member, 1900 - index * 50);
    }
  }

  /* The item the reader has repaid for and not yet walked out with, and the
     one they have asked for but not collected. Both are errands rather than
     positions, and the bell counts the first of them. */
  const awaitingCollection = await originateBetween(origin, at(1), cast.ada, 1800, 14);
  await repay(origin, awaitingCollection);
  const askedFor = await originateBetween(origin, at(2), cast.bruno, 1800, 14);
  await repay(origin, askedFor);
  await requestRedemption(origin, askedFor.borrower, at(2).id);

  /* The story is supposed to end where it started from the reader's point of
     view: on today. If an advance is added or removed without moving
     storyLengthDays with it, the demo silently drifts into the future again,
     which is the whole thing this arrangement exists to prevent. */
  const daysAdrift = Math.round(clockOffsetMs / oneDay);
  if (Math.abs(daysAdrift) > 1) {
    throw new Error(
      `the story advanced ${String(storyLengthDays + daysAdrift)} days but storyLengthDays says ` +
        `${String(storyLengthDays)}, so the demo would end ${String(daysAdrift)} days from today`,
    );
  }

  process.stdout.write(
    `seeded ${String(receipts.length)} receipts across ${String(Object.keys(cast).length + 2)} members, ` +
      `loans at every stage, note sales open, sold, withdrawn and voided, ` +
      `and about four months of wallet history\n`,
  );
}

async function advance(
  clock: DemoClient,
  milliseconds: number,
  reconnect: readonly (readonly [DemoClient, string])[] = [],
): Promise<void> {
  await clock.call('POST', '/test/clock/advance', { milliseconds });
  clockOffsetMs += milliseconds;
  for (const [client, email] of reconnect) {
    await client.signIn(email, demoPassword);
  }
}

async function issueReceipt(staff: DemoClient, borrowerEmail: string, item: Item): Promise<string> {
  const begun = await staff.call('POST', `/vaults/${vaultId}/intakes`, {
    borrowerEmail,
    itemCategory: item.category,
    itemDescription: item.description,
  });
  const intakeId = identifierOf(begun);
  await staff.call('PATCH', `/intakes/${intakeId}`, {
    serialNumbers: [...item.serialNumbers],
    sealNumber: `SEAL-${randomUUID().slice(0, 8)}`,
  });
  await staff.uploadPhoto(intakeId, solidPng(160, 160, item.tint));
  await staff.call('POST', `/intakes/${intakeId}/appraisals`, {
    value: money(item.appraisedMinorUnits),
    method: item.appraisalMethod,
    comparableReferences: item.comparableReferences,
  });
  await staff.call('POST', `/intakes/${intakeId}/seal`, {});
  const issued = await staff.call('POST', `/intakes/${intakeId}/issue-receipt`, {
    /* One policy covers the vault rather than the item, which is why every
       receipt issued here quotes the same reference. */
    insurancePolicyReference: 'POL-NYC-2026-0114',
  });
  return identifierOf(issued);
}

async function publishListing(
  origin: string,
  receipt: Receipt,
  durationDays: number,
  maxRateBasisPoints = 2400,
  /* How long it takes offers for, which is what decides whether it is still
     live at the end of the story, closing within the day, or long past its
     date. A fortnight unless the scene wants otherwise. */
  lifetimeDays = 14,
): Promise<string> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(receipt.borrower, demoPassword);
  const listing = await borrower.call('POST', '/listings', {
    receiptId: receipt.id,
    requestedPrincipal: money(receipt.ask),
    maxAnnualPercentageRateBasisPoints: maxRateBasisPoints,
    requestedDurationMs: durationDays * oneDay,
    requestedLifetimeMs: lifetimeDays * oneDay,
  });
  const listingId = identifierOf(listing);
  await borrower.call('POST', `/listings/${listingId}/publish`, {});
  return listingId;
}

async function placeOffer(
  origin: string,
  listingId: string,
  lenderEmail: string,
  rateBasisPoints: number,
): Promise<string> {
  const lender = new DemoClient(origin);
  await lender.signIn(lenderEmail, demoPassword);
  const listing = await lender.call('GET', `/listings/${listingId}`);
  const principal = listing.requestedPrincipal as { minorUnits: string };
  const durationMs = Number(listing.requestedDurationMs);
  const offer = await lender.call('POST', `/listings/${listingId}/offers`, {
    principal: money(principal.minorUnits),
    annualPercentageRateBasisPoints: rateBasisPoints,
    durationMs,
    expiresAt: new Date(serverNow() + 7 * oneDay).toISOString(),
  });
  return identifierOf(offer);
}

interface SeededLoan {
  readonly loanId: string;
  readonly borrower: string;
  readonly lender: string;
}

/* The ask in hundredths of the principal. Every loan this runs on is listed
   the moment it is originated, before any clock jump, so nothing has accrued
   yet and the principal is exactly the cap; asking under it is what puts a
   visible discount on the Secondary Market page. */
async function listPositionForSale(
  origin: string,
  loan: SeededLoan,
  hundredthsOfPrincipal: bigint,
): Promise<string> {
  const lender = new DemoClient(origin);
  await lender.signIn(loan.lender, demoPassword);
  const lent = await lender.call('GET', '/me/loans?role=lender');
  const rows = lent.items as readonly {
    id: string;
    lenderNoteId: string;
    principal: { minorUnits: string };
  }[];
  const row = rows.find((item) => item.id === loan.loanId);
  if (row === undefined) {
    throw new Error('the lender must hold the loan being listed');
  }
  const ask = (BigInt(row.principal.minorUnits) * hundredthsOfPrincipal) / 100n;
  const listed = await lender.call('POST', `/notes/${row.lenderNoteId}/sales`, {
    askPrice: money(ask.toString()),
  });
  const sale = listed.sale as { id: string };
  return sale.id;
}

async function withdrawPositionSale(
  origin: string,
  loan: SeededLoan,
  saleId: string,
): Promise<void> {
  const lender = new DemoClient(origin);
  await lender.signIn(loan.lender, demoPassword);
  await lender.call('POST', `/sales/${saleId}/withdraw`, {});
}

async function purchasePosition(origin: string, buyerEmail: string, saleId: string): Promise<void> {
  const buyer = new DemoClient(origin);
  await buyer.signIn(buyerEmail, demoPassword);
  await buyer.call('POST', `/sales/${saleId}/purchase`, {});
}

async function repay(origin: string, loan: SeededLoan): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(loan.borrower, demoPassword);
  const quote = await borrower.call('GET', `/loans/${loan.loanId}/payoff-quote`);
  const amount = quote.total as { minorUnits: string };
  await borrower.call('POST', `/loans/${loan.loanId}/repay`, {
    amount: money(amount.minorUnits),
    quotedAt: quote.quotedAt,
  });
}

async function redeem(
  origin: string,
  staff: DemoClient,
  borrowerEmail: string,
  receiptId: string,
): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(borrowerEmail, demoPassword);
  const requested = await borrower.call('POST', `/receipts/${receiptId}/redemption-requests`, {});
  const requestId = identifierOf(requested);
  await staff.call('POST', `/redemption-requests/${requestId}/verify`, {});
  await staff.call('POST', `/redemption-requests/${requestId}/release`, {
    sealNumberBroken: `SEAL-${randomUUID().slice(0, 8)}`,
  });
}

/* One loan, from a named lender to the receipt's holder. The rate ceiling
   leaves room above the winning rate, so every origination in the story also
   leaves a losing offer behind it: a borrower choosing rather than accepting
   the only thing on the table. */
async function originateBetween(
  origin: string,
  receipt: Receipt,
  lenderEmail: string,
  rateBasisPoints: number,
  durationDays: number,
): Promise<SeededLoan> {
  const losingRate = rateBasisPoints + 300;
  const listingId = await publishListing(origin, receipt, durationDays, losingRate);
  const loser = losingLenderFor(receipt.borrower, lenderEmail);
  await placeOffer(origin, listingId, loser, losingRate);
  const offerId = await placeOffer(origin, listingId, lenderEmail, rateBasisPoints);

  const borrower = new DemoClient(origin);
  await borrower.signIn(receipt.borrower, demoPassword);
  const accepted = await borrower.call(
    'POST',
    `/listings/${listingId}/offers/${offerId}/accept`,
    {},
  );
  return { loanId: identifierOf(accepted), borrower: receipt.borrower, lender: lenderEmail };
}

/* Somebody who is neither side of the loan, so the losing offer is a real
   third party rather than the borrower bidding against themselves. */
function losingLenderFor(borrowerEmail: string, lenderEmail: string): string {
  const candidate = Object.values(cast).find(
    (email) => email !== borrowerEmail && email !== lenderEmail,
  );
  if (candidate === undefined) {
    throw new Error('the cast must hold somebody outside the loan');
  }
  return candidate;
}

/* Accepts the top of the book, which supersedes every other hold standing
   against the listing. The book arrives ranked by what an offer actually
   costs the borrower over the term, so its first row is the best one by the
   product's own rule rather than by whichever rate looks smallest. */
async function acceptBest(origin: string, borrowerEmail: string, listingId: string): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(borrowerEmail, demoPassword);
  const detail = await borrower.call('GET', `/listings/${listingId}`);
  const book = detail.offerBook as readonly { id: string }[];
  const best = book[0];
  if (best === undefined) {
    throw new Error('the listing must carry an offer to accept');
  }
  await borrower.call('POST', `/listings/${listingId}/offers/${best.id}/accept`, {});
}

async function draftListing(
  origin: string,
  receipt: Receipt,
  durationDays: number,
  maxRateBasisPoints: number,
): Promise<string> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(receipt.borrower, demoPassword);
  const listing = await borrower.call('POST', '/listings', {
    receiptId: receipt.id,
    requestedPrincipal: money(receipt.ask),
    maxAnnualPercentageRateBasisPoints: maxRateBasisPoints,
    requestedDurationMs: durationDays * oneDay,
    requestedLifetimeMs: 14 * oneDay,
  });
  return identifierOf(listing);
}

async function cancelListing(
  origin: string,
  borrowerEmail: string,
  listingId: string,
): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(borrowerEmail, demoPassword);
  await borrower.call('POST', `/listings/${listingId}/cancel`, {});
}

async function markDefaulted(
  origin: string,
  noteHolderEmail: string,
  loanId: string,
): Promise<void> {
  const holder = new DemoClient(origin);
  await holder.signIn(noteHolderEmail, demoPassword);
  await holder.call('POST', `/loans/${loanId}/default`, {});
}

async function claimCollateral(
  origin: string,
  noteHolderEmail: string,
  loanId: string,
): Promise<void> {
  const holder = new DemoClient(origin);
  await holder.signIn(noteHolderEmail, demoPassword);
  await holder.call('POST', `/loans/${loanId}/claim-receipt`, {});
}

/* Scheduled, opened, bid on, and settled or left taking bids. Operations
   drives all of it, which is where the control actually lives. */
async function liquidate(
  origin: string,
  operations: DemoClient,
  loanId: string,
  reserveMinorUnits: string,
  bids: readonly string[],
  settles: boolean,
): Promise<void> {
  const scheduled = await operations.call('POST', `/loans/${loanId}/liquidations`, {
    reservePrice: money(reserveMinorUnits),
  });
  const liquidationId = identifierOf(scheduled);
  await operations.call('POST', `/liquidations/${liquidationId}/open`, {
    biddingWindowMs: 7 * oneDay,
  });
  const bidders = [cast.farid, cast.gita, cast.elena];
  for (const [index, amount] of bids.entries()) {
    const bidder = new DemoClient(origin);
    await bidder.signIn(bidders[index % bidders.length] ?? cast.farid, demoPassword);
    await bidder.call('POST', `/liquidations/${liquidationId}/bids`, { amount: money(amount) });
  }
  if (settles) {
    await operations.call('POST', `/liquidations/${liquidationId}/close`, {});
  }
}

async function withdrawCash(origin: string, email: string, minorUnits: string): Promise<void> {
  const holder = new DemoClient(origin);
  await holder.signIn(email, demoPassword);
  await holder.call('POST', '/me/withdrawals', { amount: money(minorUnits) });
}

/* Asked for and not yet handed over, which is a stage of its own on the
   receipt: staff verify identity and break the seal at the counter. */
async function requestRedemption(
  origin: string,
  borrowerEmail: string,
  receiptId: string,
): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(borrowerEmail, demoPassword);
  await borrower.call('POST', `/receipts/${receiptId}/redemption-requests`, {});
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}
`);
  process.exitCode = 1;
});
