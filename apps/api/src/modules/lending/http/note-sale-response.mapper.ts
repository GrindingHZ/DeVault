import type { NoteSaleSummary } from '@depawn/contracts';
import type { NoteSaleSummaryReadModel } from '../../../domain/ports/note-sale-queries.port';
import { toMoneyDto } from '../../shared/http/money.mapper';
import { isoOf } from './lending-response.mapper';

export function toNoteSaleSummary(readModel: NoteSaleSummaryReadModel): NoteSaleSummary {
  return {
    id: readModel.id,
    loanId: readModel.loanId,
    lenderNoteId: readModel.lenderNoteId,
    sellerAccountId: readModel.sellerAccountId,
    status: readModel.status,
    askPrice: toMoneyDto(readModel.askPrice),
    createdAt: isoOf(readModel.createdAt),
    itemDescription: readModel.itemDescription,
    itemCategory: readModel.itemCategory,
    principal: toMoneyDto(readModel.principal),
    annualPercentageRateBasisPoints: readModel.annualPercentageRateBasisPoints,
    startedAt: isoOf(readModel.startedAt),
    maturesAt: isoOf(readModel.maturesAt),
    accruedInterest: toMoneyDto(readModel.accruedInterest),
    currentValue: toMoneyDto(readModel.currentValue),
    maturityValue: toMoneyDto(readModel.maturityValue),
  };
}
