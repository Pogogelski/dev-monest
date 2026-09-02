/** Contrato único devolvido pela API, não importa qual provider respondeu. */
export interface Address {
  /** Somente dígitos. Ex.: "01001000" */
  cep: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  /** UF com 2 letras. Ex.: "SP" */
  state: string;
}

/** O que o endpoint devolve: o endereço + de onde veio e quanto demorou. */
export interface CepResponse extends Address {
  provider: string;
  durationMs: number;
}

/**
 * Tudo que a aplicação sabe sobre uma API externa.
 *
 * Adicionar uma terceira API = escrever uma classe que implemente esta interface
 * e acrescentá-la ao array do CepModule. Service, controller e contrato de saída
 * não mudam nada.
 */
export interface CepProvider {
  /** Nome curto e estável, usado nos logs e no campo `provider` da resposta. */
  readonly name: string;
  /** O prazo é do chamador: o service manda um AbortSignal já com deadline. */
  lookup(cep: string, signal: AbortSignal): Promise<Address>;
}

/** Token de injeção da lista de providers. */
export const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');

/** Orçamento por tentativa. Pior caso da requisição = este valor x nº de providers. */
export const CEP_TIMEOUT_MS = Number(process.env.CEP_TIMEOUT_MS) || 2500;

export function normalizeCep(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** 8 dígitos, e não pode ser um dígito repetido (00000000, 11111111...). */
export function isValidCep(cep: string): boolean {
  return /^\d{8}$/.test(cep) && !/^(\d)\1{7}$/.test(cep);
}
