# DeVault

**A pawn shop with a public order book, settling on Sui.**

You have a gold bar and a cash flow problem. You do not want to sell it, and you do not want to
explain yourself to a bank. So you hand it to a vault and walk out with a receipt. That receipt is
an object in your own wallet, and it goes on a marketplace where lenders bid against each other for
the right to lend you money. You take the cheapest offer. At maturity you repay and redeem your
item, or you do not, and the lender takes the claim on it.

The loan book lives on chain. Whoever holds the receipt is the owner of record, so there is no
status column anywhere that has to be kept in step with who really owns what.

## Live

| | |
|---|---|
| Marketplace | https://devault-marketplace.vercel.app |
| Vault console | https://devault-vault.vercel.app |
| API | https://devault-api.onrender.com/api/v1/health |

Sign in with a Sui wallet on testnet. zkLogin accounts, the kind a Google sign in makes, work as
well as a seed phrase. Settlement is Circle's testnet USDC, so a wallet needs some to lend or buy.

## What it does

**For borrowers and lenders.** The same person can be both; there is no borrower role and no lender
role, only your relationship to a listing. Browse live listings, open a pledge against a receipt you
hold, take offers ranked cheapest first, repay before maturity, and redeem the item. On the other
side: make an offer and your coin is held rather than spent, reclaim it yourself if you lose, and
collect the payoff if you win.

**A secondary market.** A lender who does not want to wait for maturity can list their position.
Someone else buys the claim, and the payoff follows the new holder.

**For vault staff.** A mint flow that takes an item in: photograph it, appraise it, and issue the
receipt to the member's wallet. Plus the release queue for people collecting their property. Access
is by wallet address, configured on the service rather than stored as a row, so a database reset can
never revoke a custodian.

**Evidence stays off chain.** The receipt carries a hash that commits to the photographs, and the
photographs themselves sit in a bucket. Each receipt also carries the URL of its own photograph, so
a wallet showing the object renders the item rather than a bare object id.

## On chain

Nine Move modules on Sui testnet:

| Module | Holds |
|---|---|
| `custody` | `VaultReceipt`, the item's twin, owned by the borrower, plus its `Display` |
| `pledge` | The loan: open, offer, accept, repay, claim, cancel |
| `escrow` | Offer holds and their refunds |
| `market` | The secondary market in lender positions |
| `notes` | Borrower and lender notes, the two sides of a live loan |
| `interest` | Accrual, truncating in the borrower's favour |
| `config` | Capabilities, protocol parameters, the pause switch |
| `attestation` | Vault attestations |
| `usdc` | A stand in coin, used only on a local network |

Writes a member makes are sponsored, so nobody needs gas to take part. The one custodial act is
issuing a receipt, which the operator signs because only a person can vouch that an item is really
in the vault. Everything after that is the member's own signature.

An indexer follows the package's events into a read model with a durable cursor, so the API can
answer list and search queries that a full node cannot.

## Stack

TypeScript throughout, strict mode.

- **Chain** Sui Move, `@mysten/sui`, `@mysten/dapp-kit`
- **API** NestJS, Prisma, PostgreSQL
- **Web** React 19, Vite, TanStack Router and Query, Tailwind
- **Tests** Vitest, Supertest, Testcontainers, Playwright, `sui move test`
- **Deployed on** Supabase, Render, Vercel

## Architecture

The rule everything follows: **the domain layer is identical in Web2 and Web3.** Money, custody,
identity and time reach the domain only through ports, interfaces defined in the domain with no
knowledge of Postgres, Prisma, HTTP or Sui. The Web2 adapters were swapped for Sui ones without the
domain changing. `pnpm check` fails the build if a domain file so much as imports from
infrastructure.

```
apps/api              NestJS. Domain, use cases, ports, adapters, HTTP.
apps/marketplace      Borrowers and lenders.
apps/vault-console    Vault staff.
packages/contracts    Request and response types, shared by both front ends.
packages/ui           Components and the frozen design tokens.
packages/test-support Fixtures and the shared port contract suites.
packages/move         The Sui package.
docs/                 Sixteen normative documents, written before the code.
```

## Running it

```bash
pnpm install
pnpm db:up          # postgres in docker
pnpm db:migrate
pnpm dev            # api plus both front ends, hot reload
```

The API needs chain configuration to start: `.env.example` lists what to set, and the operator key
is the one that holds the capabilities. `pnpm chain:publish` compiles the Move package, publishes
it, and records the deployment the API boots from.

```bash
pnpm chain:localnet # a single validator network to develop against
pnpm move:test      # the Move test suite
pnpm chain:walk     # drive a loan end to end against the configured network
```

`docs/15-deployment.md` is the step by step for putting it on Supabase, Render and Vercel.

## Checking it

```bash
pnpm check          # types, lint, format, architecture boundaries, prose, design tokens
pnpm test           # unit and integration
pnpm test:e2e       # playwright
```

346 unit tests across the API, 66 Move tests, integration tests against a real Postgres in a
container, and Playwright suites across both front ends. Ports are proved by contract suites that
run the same cases against every adapter behind a port, so a Sui adapter has to answer what the
Postgres one answered.

## Reading further

| | |
|---|---|
| `DOCUMENTATION.md` | The short write up: approach, decisions, flows, architecture |
| `docs/00-product-overview.md` | Domain, actors, glossary, business rules |
| `docs/08-web3-migration.md` | What moved on chain, and what deliberately did not |
| `docs/10-flows.md` | Every flow end to end, with failure modes |
| `docs/15-deployment.md` | Taking it live |
| `docs/OPEN-QUESTIONS.md` | What was ambiguous, and what was implemented instead of guessing |

## What this is not

Testnet only, with one vault, one settlement coin and one jurisdiction. The appraisal is a person's
judgement typed into a form, not an oracle. Liquidation hands the claim to the lender rather than
running an auction. The outbox is honestly at least once rather than exactly once. This is a
pawnbroker running a loan book on modern rails, not a trustless protocol, and the custodian
capability is exactly the trust assumption it looks like.
