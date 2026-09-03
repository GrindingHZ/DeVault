#!/usr/bin/env sh
# Bring the schema up to date, then start. The loan book lives on chain, so a
# fresh database holds only accounts a member creates by signing in; there is
# nothing to seed.
set -eu

cd /repo/apps/api

echo "waiting for the database and applying migrations"
until pnpm exec prisma migrate deploy >/dev/null 2>&1; do
  sleep 2
done
echo "schema is up to date"

# `start` rather than `dev`: a file watcher inside a container watches files
# nobody is editing. Demo mode comes from the environment either way.
exec node -r @swc-node/register "src/${API_ENTRY:-main}.ts"
