/* The failure a chain driver produces until its adapter exists. It is thrown
   from the port and from nowhere else, which is the P9 exit criterion in
   docs/07-phase-plan.md: a leak anywhere upstream would surface a different
   error somewhere inside a use case. */
export class ChainDriverNotReady extends Error {
  constructor(port: string) {
    super(`${port} is configured for the chain driver and the chain adapter is not built yet`);
    this.name = 'ChainDriverNotReady';
  }
}
