# p10a-move-package brainstorm

The second item of docs/superpowers/specs/2026-08-25-web3-migration-design.md: the package
itself, with nothing calling it yet. Six modules, one approach (the spec settled the shared
receipt and the payout hot potato). The settlement coin became a six decimal USDC stand in when
the ask for USDC arrived mid slice; the escrow module was already generic over the coin type, so
nothing else moved. Fixture tests are generated from the shared file rather than hand copied, so
the api and the chain cannot drift apart quietly. What could break elsewhere: nothing; no
TypeScript calls the package until p10b. Ambiguity: the coin registry flow is a two step handshake
that a local test coin does not need, so the classic `create_currency` stays with the lint
suppressed and the reason beside it.
