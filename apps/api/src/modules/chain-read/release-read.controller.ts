import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { ReleaseQueueResponse } from '@depawn/contracts';
import { Roles } from '../shared/http/roles.decorator';
import { ReleaseReadService } from './release-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The vault counter's worklist, read from the chain. Vault staff only: a
   release queue names members and the items they are collecting, which is not a
   member's to see. */
@Controller('chain')
export class ReleaseReadController {
  constructor(private readonly releases: ReleaseReadService) {}

  @Get('releases')
  @Roles('VAULT_STAFF')
  async read(): Promise<ReleaseQueueResponse> {
    try {
      const items = await this.releases.read();
      return {
        items: items.map((item) => ({
          digest: item.digest,
          receiptId: item.receiptId,
          receiptKey: item.receiptKey,
          holder: item.holder,
        })),
      };
    } catch (error) {
      if (error instanceof DeploymentNotFound) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
