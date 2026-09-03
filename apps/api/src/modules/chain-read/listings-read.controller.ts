import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { ListingsResponse } from '@depawn/contracts';
import { ListingsReadService } from './listings-read.service';
import { DeploymentNotFound } from './wallet-read.service';

/* The open market, read from the chain. Any signed-in member can browse the
   listings a borrower has opened; making an offer is the member's own signed
   transaction, built elsewhere. */
@Controller('chain')
export class ListingsReadController {
  constructor(private readonly listings: ListingsReadService) {}

  @Get('listings')
  async read(): Promise<ListingsResponse> {
    try {
      const result = await this.listings.read();
      return {
        decimals: result.decimals,
        listings: result.listings.map((listing) => ({
          pledgeId: listing.pledgeId,
          borrower: listing.borrower,
          requestedAprBps: listing.requestedAprBps,
          appraisedValueBaseUnits: listing.appraisedValueBaseUnits.toString(),
          itemCategory: listing.itemCategory,
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
