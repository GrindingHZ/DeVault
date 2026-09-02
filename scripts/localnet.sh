#!/usr/bin/env bash
# A local Sui network for the chain suites and the demo. One validator, because
# a larger committee on one machine occasionally takes over a minute to
# checkpoint a transaction, which every read after a write waits for.
set -uo pipefail
exec sui start --force-regenesis --with-faucet --committee-size 1 --epoch-duration-ms 86400000 "$@"
