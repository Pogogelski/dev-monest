import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { CepError } from '../cep/cep.errors.js';
import type { RequestWithId } from './request-id.middleware.js';

const GENERIC = 'Erro interno inesperado.';

/**
 * Único lugar que traduz exceção em resposta HTTP. Cada erro de domínio já sabe
 * o seu status e o seu código, então nada vira 500 por descuido.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();
    const { status, code, message } = describe(exception);

    const body: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
      requestId: req.requestId,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };

    // O cliente vê o motivo de cada API — mas só o código, nunca a mensagem
    // crua, que pode carregar URL interna ou detalhe de erro de rede.
    if (exception instanceof CepError && exception.attempts) {
      body.attempts = exception.attempts.map(({ provider, code: c, durationMs }) => ({
        provider,
        code: c,
        durationMs,
      }));
    }

    // No log fica tudo, inclusive a mensagem real do 500 que o cliente não vê.
    const logged = { ...body, message: (exception as Error)?.message ?? message };
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logged, (exception as Error)?.stack);
    } else {
      this.logger.warn(logged);
    }

    res.status(status).json(body);
  }
}

function describe(exception: unknown): { status: number; code: string; message: string } {
  if (exception instanceof CepError) {
    return { status: exception.status, code: exception.code, message: exception.message };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      code: (HttpStatus[status] as string) ?? 'HTTP_ERROR',
      // Mensagem de erro 5xx é detalhe interno: o cliente recebe a genérica.
      message: status >= HttpStatus.INTERNAL_SERVER_ERROR ? GENERIC : exception.message,
    };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR', message: GENERIC };
}
