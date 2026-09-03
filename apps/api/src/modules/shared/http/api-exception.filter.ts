import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../../domain/shared/domain-error';
import { CurrencyMismatchError } from '../../../domain/shared/money';
import { DomainErrorHttpException } from './domain-error-http.exception';
import type { ErrorEnvelope } from './domain-error-http.exception';
import { domainErrorStatusFor } from './domain-error-status';

const codeByStatus: Record<number, string> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }
  const errorValue = body.error;
  if (typeof errorValue !== 'object' || errorValue === null || !('code' in errorValue)) {
    return false;
  }
  return typeof errorValue.code === 'string';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainErrorHttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    /* A use case answers a domain error as a Result the controller wraps.
       A chain execution cannot: the state can move between the build and
       the signed submit, and the submitter throws the domain error the
       Move abort names. It is answered with its own code and status, so a
       screen that acted on a stale view hears why rather than a fault. */
    if (exception instanceof DomainError) {
      const envelope: ErrorEnvelope = {
        error: { code: exception.code, message: exception.message },
      };
      response.status(domainErrorStatusFor(exception.code)).json(envelope);
      return;
    }

    /* Money arithmetic across currencies throws rather than returning a
       Result, because inside the domain it is a programming error. At the
       edge it is a bad request, and docs/04-api-contract.md names the code
       for it. */
    if (exception instanceof CurrencyMismatchError) {
      const envelope: ErrorEnvelope = {
        error: { code: 'CURRENCY_MISMATCH', message: exception.message },
      };
      response.status(422).json(envelope);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isErrorEnvelope(body)) {
        response.status(status).json(body);
        return;
      }
      const envelope: ErrorEnvelope = {
        error: { code: codeByStatus[status] ?? 'FAULT', message: exception.message },
      };
      response.status(status).json(envelope);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    const envelope: ErrorEnvelope = {
      error: { code: 'FAULT', message: 'The request failed. Try again.' },
    };
    response.status(500).json(envelope);
  }
}
