# 15. Deployment

How the demo goes live: Supabase holds the database and the photographs, Render runs the api, and
Vercel serves the two front ends. Every step is a dashboard click unless it says otherwise.

## What you are building

```
Browser
  |
  |-- devault-marketplace.vercel.app    borrower and lender
  |-- devault-vault.vercel.app          vault staff
  |
  |  both rewrite /api/* through to Render, so the browser
  |  only ever sees one origin
  v
devault-api.onrender.com                nestjs, one always on process
  |                                     outbox drain and chain indexer, every 5s
  v
Supabase                                postgres + an evidence bucket
```

The rewrite is the part that matters. `auth.controller.ts` sets the session cookie `sameSite:
'strict'` and the api has no CORS configuration at all. Proxying the api through the same domain the
page came from keeps the cookie first party and means no api code changes for deployment. Point a
front end straight at the Render URL instead and sign in fails silently.

## Before you start

Three free accounts: Supabase, Render, Vercel. Each signs in with GitHub, which also gives them
access to the repository. You also need the operator key described in `.env.example`, the bech32
`suiprivkey` that holds the CustodianCap and sponsors gas on testnet.

Do the three steps in order. Render needs a value from Supabase, and Vercel needs the Render URL.

## Step 1: Supabase, the database and the bucket

1. Go to `supabase.com/dashboard` and select **New project**.
2. Name it `devault`. Pick a region near you. Set a database password and **write it down**, because
   the dashboard will not show it again.
3. Wait for the project to finish provisioning, which takes a minute or two.

### Get the connection string

4. Open **Project Settings**, then **Database**, then **Connection string**, and choose the **URI**
   tab.
5. Supabase offers more than one connection mode. Take the **Session pooler** one. The transaction
   pooler, on port 6543, cannot run `prisma migrate deploy`, and the api applies migrations on every
   boot. The session pooler also answers over IPv4, which Render needs.
6. Replace `[YOUR-PASSWORD]` in the string with the password from step 2. Keep the finished string
   for Step 2.

### Create the bucket

7. Open **Storage** in the left sidebar and select **New bucket**.
8. Name it `evidence`. Leave it **private**. The api reads it with the service role key, so nothing
   needs to be public, and item photographs should not be world readable.

### Get the service role key

9. Open **Project Settings**, then **API Keys**.
10. Copy the **project URL** and the **`service_role` key**. Keep both for Step 2.

The `service_role` key bypasses row level security. It belongs in Render's environment and nowhere
else. Never put it in a front end, where anyone could read it out of the bundle.

## Step 2: Render, the api

1. Go to `dashboard.render.com`, select **New**, then **Web Service**.
2. Connect the `GrindingHZ/DeVault` repository.
3. Name the service **`devault-api`** exactly. `vercel.json` already points at
   `devault-api.onrender.com`. A different name means editing that file.
4. Runtime **Node**, not Docker. `docker/Dockerfile` is multi stage and its last stage is nginx, so
   Render would build the wrong one.
5. Set the commands:

   **Build command**

   ```
   corepack enable && pnpm install --frozen-lockfile && pnpm --filter @depawn/api exec prisma generate
   ```

   **Start command**

   ```
   pnpm --filter @depawn/api exec prisma migrate deploy && pnpm --filter @depawn/api start
   ```

   The start command applies all 33 migrations before serving, so the first deploy builds the schema
   on the empty Supabase database by itself.

6. Choose the **Free** instance type.
7. Add the environment variables below under **Environment**. Do not set `PORT`; Render sets it and
   the api reads it.

| Variable | Value | Secret |
|---|---|---|
| `NODE_VERSION` | `24` | no |
| `DATABASE_URL` | the session pooler string from Step 1 | yes |
| `SETTLEMENT_DRIVER` | `chain` | no |
| `CUSTODY_DRIVER` | `chain` | no |
| `SUI_NETWORK` | `testnet` | no |
| `SUI_OPERATOR_SECRET_KEY` | the `suiprivkey` of the operator | yes |
| `SUI_ACCOUNT_SEED` | any 64 hex characters | yes |
| `CUSTODIAN_WALLET_ADDRESSES` | the wallet addresses allowed into the vault console, comma separated | no |
| `STORAGE_DRIVER` | `supabase` | no |
| `SUPABASE_URL` | the project URL from Step 1 | no |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key from Step 1 | yes |
| `PUBLIC_BASE_URL` | `https://devault-marketplace.vercel.app` | no |

Both drivers have to be set. `configuration.ts` defaults them to `ledger` and `database`, and the
adapters behind those defaults were removed in the web3 migration, so a service without them will
not boot.

`PUBLIC_BASE_URL` is the one variable that cannot be corrected later. It is written into every
`VaultReceipt` as the url of the item's photograph, which is what lets a wallet render the item
rather than a bare object. Point it at the marketplace origin, not the Render origin: the front end
domain is the stable one, and the rewrite carries `/api/*` through to Render anyway. A receipt
minted while this is wrong keeps the wrong url for good.

8. Select **Create Web Service** and watch the log. A first deploy takes several minutes, most of it
   the pnpm install.
9. When the log reports the migrations applied and the server listening, open
   `https://devault-api.onrender.com/api/v1/health`. It should answer. This is the same URL the
   container health check uses.

## Step 3: Vercel, the two front ends

Do this twice, once per app. Everything is identical except the three values in the table.

1. Go to `vercel.com/new` and import `GrindingHZ/DeVault`.

2. **Leave Root Directory as the repository root.** Vercel offers to set it to the app folder
   because it detects Turborepo. Refuse. Vercel reads `vercel.json` from inside the root directory,
   and `vercel.json` lives at the repository root. Point the root directory at an app folder and the
   rewrites are silently absent: every api call answers 404 and every deep link answers 404, with
   nothing in the build log to say why.

3. Set **Framework Preset** to **Other**.

4. Open **Build and Output Settings** and override the install and build commands. Each field has
   its own **Override** toggle beside it, and typing a value without flipping the toggle does
   nothing.

| Setting | marketplace | vault console |
|---|---|---|
| Project name | anything you like | anything you like |
| Install Command | `pnpm install --frozen-lockfile --filter @depawn/marketplace...` | `pnpm install --frozen-lockfile --filter @depawn/vault-console...` |
| Build Command | `pnpm --filter @depawn/marketplace run build && cp -r apps/marketplace/dist dist` | `pnpm --filter @depawn/vault-console run build && cp -r apps/vault-console/dist dist` |
| Output Directory | leave it alone | leave it alone |

**Leave Output Directory at its default.** Setting it to `apps/<app>/dist` is the obvious move and
it does not survive: the preset keeps winning and the deploy fails with `No Output Directory named
"dist" found`, after a build that plainly succeeded. Vercel wants a `dist` beside the root
directory, so the build command copies one there rather than arguing with the setting. A root
`dist/` is already gitignored.

The trailing `...` on the install filter is significant. It means the package plus its workspace
dependencies, which resolves to the app, `@depawn/contracts` and `@depawn/ui`. Without it the build
fails on missing workspace imports. With a bare `pnpm install` instead, Vercel installs the whole
workspace, which drags in the api's `@testcontainers/postgresql`, then `ssh2`, then `cpu-features`,
and spends the build compiling native code through node-gyp that no front end needs.

5. Under **Environment Variables** add `VITE_SUI_NETWORK` with the value `testnet`. Vite reads it at
   build time, so it has to exist before the first build, and changing it later needs a redeploy.

   Leave `VITE_TEST_WALLET` unset. It mounts a test wallet meant only for Playwright.

6. Select **Deploy**.

The project name is free. Nothing in the repository refers to either front end by name. What is not
free is the Render service name `devault-api`, which is written into `vercel.json`, and
`PUBLIC_BASE_URL`, which has to name an origin that will still resolve in a year because it is
minted into every receipt.

The repository's `vercel.json` supplies the rest: it rewrites `/api/*` to Render and sends every
other path to `index.html` so a deep link like `/listings/01M0...` still loads the app shell rather
than a 404. Vercel checks the filesystem before applying a rewrite, so hashed assets still serve
normally.

## Step 4: check it works

1. Open the marketplace URL. The listings page should load with data, which means the rewrite
   reached Render and Render reached Supabase.
2. Sign in with a wallet. If the session survives a page refresh, the first party cookie is intact
   and the proxy is doing its job.
3. Sign in to the vault console with a wallet listed in `CUSTODIAN_WALLET_ADDRESSES` and issue a
   receipt with a photograph.
4. Redeploy the api on Render, then load that receipt again. The photograph should still be there.
   That is the bucket adapter working. On the filesystem adapter it would be gone.

## Three things about the free tiers

**Render sleeps after about 15 minutes idle.** The first request after that takes roughly 50 seconds
while the service wakes. The chain indexer keeps a durable cursor and reads newest first, so it
catches up on waking and loses no events, but the read model is stale for as long as the service was
asleep. If you are demonstrating live, load the page a minute beforehand.

**Supabase pauses a project after about 7 days idle.** Restore it from the dashboard before a demo
that comes after a quiet week.

**Neither free tier is a place for real custody.** The operator key on Render sponsors gas and holds
the CustodianCap. This setup is sized for a testnet demonstration and nothing more.

## When something fails

| What you see | Where to look |
|---|---|
| Render build fails on `pnpm: not found` | `corepack enable` missing from the build command |
| Render boots then exits, naming a variable | A driver or chain variable is unset. The error names it |
| `prisma migrate deploy` hangs or times out | The transaction pooler on 6543. Switch to the session pooler |
| Front end loads, every api call 404s | The Render service is not named `devault-api`. Fix the URL in `vercel.json` |
| Sign in appears to work, refresh logs you out | The front end is calling Render directly. The cookie is `sameSite: 'strict'` and needs the rewrite |
| Photographs vanish after a deploy | `STORAGE_DRIVER` is not `supabase` on Render |
| Deep link 404s, root page fine | `vercel.json` did not reach the build. Check Root Directory is the repository root |
| Vercel: `No Output Directory named "dist" found` | The Output Directory override toggle is off, so the preset default won. Flip the toggle |
| Vercel build compiles `cpu-features` through node-gyp | The install command is not scoped. Add `--filter @depawn/<app>...` |
