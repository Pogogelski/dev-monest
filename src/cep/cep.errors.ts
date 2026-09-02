import { HttpStatus } from '@nestjs/common';

/** A causa da falha. Vai para o cliente no campo `code` e para o log. */
export type CepErrorCode =
  | 'INVALID_CEP'
  | 'CEP_NOT_FOUND'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'ALL_PROVIDERS_FAILED';

/** Registro de uma tentativa que falhou — vai para o log e para o corpo do erro. */
export interface ProviderAttempt {
  provider: string;
  code: CepErrorCode;
  message: string;
  durationMs: number;
}

/**
 * Um erro só, carregando a causa (`code`) e o destino HTTP (`status`).
 * É isso que faz "timeout" não virar a mesma coisa que "CEP não existe":
 * o filter global lê esses dois campos e monta a resposta.
 */
export class CepError extends Error {
  constructor(
    readonly code: CepErrorCode,
    readonly status: HttpStatus,
    message: string,
    /** Só no erro agregado: o que cada API respondeu. */
    readonly attempts?: ProviderAttempt[],
  ) {
    super(message);
    this.name = 'CepError';
  }
}

/** CEP malformado: erro do cliente, nem chega a bater em provider. */
export const invalidCep = (cep: string): CepError =>
  new CepError('INVALID_CEP', HttpStatus.BAD_REQUEST, `CEP inválido: "${cep}". Esperado 8 dígitos.`);

/** O provider respondeu direitinho dizendo que o CEP não existe. */
export const cepNotFound = (cep: string, provider: string): CepError =>
  new CepError('CEP_NOT_FOUND', HttpStatus.NOT_FOUND, `CEP ${cep} não encontrado em ${provider}.`);

/** O provider estourou o orçamento de tempo. */
export const providerTimeout = (provider: string, timeoutMs: number): CepError =>
  new CepError(
    'PROVIDER_TIMEOUT',
    HttpStatus.GATEWAY_TIMEOUT,
    `${provider} não respondeu em ${timeoutMs}ms.`,
  );

/** Provider fora do ar: 5xx, erro de rede ou resposta que não dá para ler. */
export const providerUnavailable = (provider: string, detail: string): CepError =>
  new CepError(
    'PROVIDER_UNAVAILABLE',
    HttpStatus.SERVICE_UNAVAILABLE,
    `${provider} indisponível: ${detail}`,
  );

/** Ninguém respondeu. Se todas apenas demoraram, o status vira 504. */
export const allProvidersFailed = (cep: string, attempts: ProviderAttempt[]): CepError =>
  new CepError(
    'ALL_PROVIDERS_FAILED',
    attempts.every((a) => a.code === 'PROVIDER_TIMEOUT')
      ? HttpStatus.GATEWAY_TIMEOUT
      : HttpStatus.SERVICE_UNAVAILABLE,
    `Nenhum provider respondeu para o CEP ${cep}: ${attempts
      .map((a) => `${a.provider}=${a.code}`)
      .join(', ')}`,
    attempts,
  );
