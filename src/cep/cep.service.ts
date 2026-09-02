import { Inject, Injectable, Logger } from '@nestjs/common';
import { CepError, allProvidersFailed, cepNotFound, invalidCep, providerUnavailable } from './cep.errors.js';
import type { ProviderAttempt } from './cep.errors.js';
import { CEP_PROVIDERS, CEP_TIMEOUT_MS, isValidCep, normalizeCep } from './cep.types.js';
import type { CepProvider, CepResponse } from './cep.types.js';

@Injectable()
export class CepService {
  private readonly logger = new Logger(CepService.name);
  /** Cursor do round-robin. */
  private cursor = 0;

  constructor(@Inject(CEP_PROVIDERS) private readonly providers: CepProvider[]) {}

  async lookup(rawCep: string, requestId?: string): Promise<CepResponse> {
    const cep = normalizeCep(rawCep);
    // CEP quebrado é erro do cliente: nem gasta chamada externa.
    if (!isValidCep(cep)) throw invalidCep(rawCep);

    const attempts: ProviderAttempt[] = [];

    // Cada tentativa tem prazo próprio, então o pior caso da requisição é
    // CEP_TIMEOUT_MS x nº de providers (hoje 2 x 2,5s = 5s), nunca os 30s da API.
    for (const provider of this.rotated()) {
      const startedAt = Date.now();
      try {
        const address = await provider.lookup(cep, AbortSignal.timeout(CEP_TIMEOUT_MS));
        const durationMs = Date.now() - startedAt;
        this.logger.log({ requestId, cep, provider: provider.name, outcome: 'ok', durationMs });
        return { ...address, provider: provider.name, durationMs };
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const failure = toCepError(provider.name, error);
        const attempt = { provider: provider.name, code: failure.code, message: failure.message, durationMs };
        attempts.push(attempt);
        // Não interrompe: o próximo provider ainda pode responder.
        this.logger.warn({ requestId, cep, outcome: 'falhou', ...attempt });
      }
    }

    // Se todo mundo disse "não existe", o CEP é que não existe (404).
    // Qualquer outra combinação é falha de infraestrutura (503/504).
    const failure =
      attempts.length > 0 && attempts.every((a) => a.code === 'CEP_NOT_FOUND')
        ? cepNotFound(cep, 'nenhum provider')
        : allProvidersFailed(cep, attempts);

    this.logger.error({ requestId, cep, outcome: 'esgotado', code: failure.code, attempts });
    throw failure;
  }

  /**
   * Round-robin: a cada chamada a lista começa em um provider diferente.
   * Espalha a carga e evita que uma das APIs vire ponto único de falha.
   */
  private rotated(): CepProvider[] {
    const offset = this.cursor;
    this.cursor = (this.cursor + 1) % this.providers.length;
    return [...this.providers.slice(offset), ...this.providers.slice(0, offset)];
  }
}

/** Provider que vazou um erro cru vira um erro de domínio. */
function toCepError(provider: string, error: unknown): CepError {
  if (error instanceof CepError) return error;
  return providerUnavailable(provider, error instanceof Error ? error.message : String(error));
}
