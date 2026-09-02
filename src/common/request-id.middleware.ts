import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';
/** Só aceitamos um id do cliente se ele for inofensivo (vai parar no log). */
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export type RequestWithId = Request & { requestId?: string };

/**
 * Observabilidade em duas linhas de responsabilidade:
 * carimba um id de correlação em cada requisição e registra uma linha de acesso
 * quando ela termina — inclusive nas rotas que não existem, porque o log fica
 * no middleware e não em um interceptor.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const received = req.headers[HEADER];
    const candidate = Array.isArray(received) ? received[0] : received;
    // Reaproveita o id de quem chamou para o rastro cruzar serviços.
    const requestId = candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();

    req.requestId = requestId;
    res.setHeader(HEADER, requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      const line = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      };
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
