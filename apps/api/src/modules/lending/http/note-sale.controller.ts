import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { listNoteForSaleRequestSchema } from '@depawn/contracts';
import type {
  BrowseNoteSalesResponse,
  ListNoteForSaleRequest,
  MyNoteSalesResponse,
  NoteSaleActionResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { AskExceedsCurrentValue } from '../../../domain/lending/ask-exceeds-current-value';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { NOTE_SALE_QUERIES } from '../../../domain/ports/note-sale-queries.port';
import type { NoteSaleQueries } from '../../../domain/ports/note-sale-queries.port';
import { lenderNoteIdOf, noteSaleIdOf } from '../../../domain/shared/identifiers';
import type { DomainError } from '../../../domain/shared/domain-error';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { domainErrorStatusFor } from '../../shared/http/domain-error-status';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toMoneyDto } from '../../shared/http/money.mapper';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { ListNoteForSaleUseCase } from '../application/list-note-for-sale.use-case';
import { PurchaseNoteSaleUseCase } from '../application/purchase-note-sale.use-case';
import { WithdrawNoteSaleUseCase } from '../application/withdraw-note-sale.use-case';
import { isoOf } from './lending-response.mapper';
import { toNoteSaleSummary } from './note-sale-response.mapper';

@Controller()
export class NoteSaleController {
  constructor(
    private readonly listNoteForSale: ListNoteForSaleUseCase,
    private readonly withdrawNoteSale: WithdrawNoteSaleUseCase,
    private readonly purchaseNoteSale: PurchaseNoteSaleUseCase,
    @Inject(NOTE_SALE_QUERIES) private readonly noteSaleQueries: NoteSaleQueries,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  @Get('market/note-sales')
  async browse(): Promise<BrowseNoteSalesResponse> {
    const now = this.clock.now();
    const items = await this.noteSaleQueries.browseOpen(now);
    return { items: items.map(toNoteSaleSummary), asOf: isoOf(now) };
  }

  @Get('me/note-sales')
  async mine(@CurrentAccount() account: Account): Promise<MyNoteSalesResponse> {
    const now = this.clock.now();
    const items = await this.noteSaleQueries.mine(account.id, now);
    return { items: items.map(toNoteSaleSummary), asOf: isoOf(now) };
  }

  @Post('notes/:noteId/sales')
  @UseInterceptors(IdempotencyInterceptor)
  async list(
    @Param('noteId') noteId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(listNoteForSaleRequestSchema)) body: ListNoteForSaleRequest,
  ): Promise<NoteSaleActionResponse> {
    const result = await this.listNoteForSale.execute({
      lenderNoteId: lenderNoteIdOf(noteId),
      requestedBy: account.id,
      askPrice: toMoney(body.askPrice),
    });
    if (!result.ok) {
      throw this.toHttp(result.error);
    }
    return this.saleResponseFor(result.value.id);
  }

  @Post('sales/:saleId/withdraw')
  @UseInterceptors(IdempotencyInterceptor)
  async withdraw(
    @Param('saleId') saleId: string,
    @CurrentAccount() account: Account,
  ): Promise<NoteSaleActionResponse> {
    const result = await this.withdrawNoteSale.execute({
      noteSaleId: noteSaleIdOf(saleId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw this.toHttp(result.error);
    }
    return this.saleResponseFor(result.value.id);
  }

  @Post('sales/:saleId/purchase')
  @UseInterceptors(IdempotencyInterceptor)
  async purchase(
    @Param('saleId') saleId: string,
    @CurrentAccount() account: Account,
  ): Promise<NoteSaleActionResponse> {
    const result = await this.purchaseNoteSale.execute({
      noteSaleId: noteSaleIdOf(saleId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw this.toHttp(result.error);
    }
    return this.saleResponseFor(result.value.sale.id);
  }

  /* Writes answer with what the read side would say, so a client never sees
     two shapes for one sale. */
  private async saleResponseFor(saleId: string): Promise<NoteSaleActionResponse> {
    const readModel = await this.noteSaleQueries.byId(saleId, this.clock.now());
    if (readModel === null) {
      throw new NotFoundException();
    }
    return { sale: toNoteSaleSummary(readModel) };
  }

  private toHttp(error: DomainError): DomainErrorHttpException {
    // A refused ask answers with the cap, the way a stale payoff quote
    // answers with the amount now due (docs/10-flows.md flow 5).
    const details =
      error instanceof AskExceedsCurrentValue
        ? { currentValue: toMoneyDto(error.currentValue) }
        : undefined;
    return new DomainErrorHttpException(error, domainErrorStatusFor(error.code), details);
  }
}
