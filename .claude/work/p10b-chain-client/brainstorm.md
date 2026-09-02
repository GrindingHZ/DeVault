# p10b-chain-client brainstorm

The third item of the spec. One approach, decided there: builders are pure functions from a
deployment and an input to commands on a Transaction; the unit of work hands out settlement
references that read as pending until the digest is known and patches the few columns a
reference lands in. What surfaced while building: the SDK's build step simulates the block and
throws a Move abort as a SimulationError rather than answering a failed transaction, so the
submitter maps both shapes; and the application module read the environment at import time,
which broke a suite that chooses its drivers after importing the harness, so the module is now
assembled by a function. What could break: nothing on the ledger driver, which is what every
existing suite runs on; the chain paths are exercised in p10c. Ambiguity: none worth an open
question.
