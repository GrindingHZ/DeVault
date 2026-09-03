import {
  browseNoteSalesResponseSchema,
  myNoteSalesResponseSchema,
  noteSaleActionResponseSchema,
} from '../note-sales';
import type {
  BrowseNoteSalesResponse,
  ListNoteForSaleRequest,
  MyNoteSalesResponse,
  NoteSaleActionResponse,
} from '../note-sales';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function browseNoteSales(): Promise<BrowseNoteSalesResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/market/note-sales`,
    responseSchema: browseNoteSalesResponseSchema,
  });
}

export function fetchMyNoteSales(): Promise<MyNoteSalesResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/note-sales`,
    responseSchema: myNoteSalesResponseSchema,
  });
}

export function listNoteForSale(
  lenderNoteId: string,
  body: ListNoteForSaleRequest,
  options: RequestOptions,
): Promise<NoteSaleActionResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/notes/${lenderNoteId}/sales`,
    body,
    options,
    responseSchema: noteSaleActionResponseSchema,
  });
}

export function withdrawNoteSale(
  noteSaleId: string,
  options: RequestOptions,
): Promise<NoteSaleActionResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/sales/${noteSaleId}/withdraw`,
    body: {},
    options,
    responseSchema: noteSaleActionResponseSchema,
  });
}

export function purchaseNoteSale(
  noteSaleId: string,
  options: RequestOptions,
): Promise<NoteSaleActionResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/sales/${noteSaleId}/purchase`,
    body: {},
    options,
    responseSchema: noteSaleActionResponseSchema,
  });
}
