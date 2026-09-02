import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { CepService } from './cep.service.js';
import { cepNotFound, providerTimeout, providerUnavailable } from './cep.errors.js';
import { isValidCep, normalizeCep } from './cep.types.js';
import type { Address, CepProvider } from './cep.types.js';

const ENDERECO: Address = {
  cep: '01001000',
  street: 'Praça da Sé',
  complement: 'lado ímpar',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
};

/** Provider falso: nenhum teste toca a rede. */
function fake(name: string, resposta: () => Promise<Address>) {
  return { name, calls: 0, lookup() { this.calls += 1; return resposta(); } } as CepProvider & {
    calls: number;
  };
}

const ok = (name: string) => fake(name, async () => ENDERECO);
const lento = (name: string) => fake(name, async () => { throw providerTimeout(name, 2500); });
const fora = (name: string) => fake(name, async () => { throw providerUnavailable(name, 'HTTP 500'); });
const semCep = (name: string) => fake(name, async () => { throw cepNotFound('01001000', name); });

beforeAll(() => Logger.overrideLogger(false));

describe('CepService', () => {
  it('devolve o endereço unificado e diz qual provider respondeu', async () => {
    const service = new CepService([ok('viacep'), ok('brasilapi')]);

    const resultado = await service.lookup('01001-000');

    expect(resultado).toMatchObject({ ...ENDERECO, provider: 'viacep' });
    expect(typeof resultado.durationMs).toBe('number');
  });

  it('alterna o provider inicial a cada chamada (round-robin)', async () => {
    const service = new CepService([ok('viacep'), ok('brasilapi')]);

    const providers = [
      (await service.lookup('01001000')).provider,
      (await service.lookup('01001000')).provider,
      (await service.lookup('01001000')).provider,
    ];

    expect(providers).toEqual(['viacep', 'brasilapi', 'viacep']);
  });

  it('faz failover quando o primeiro provider estoura o tempo', async () => {
    const primeiro = lento('viacep');
    const service = new CepService([primeiro, ok('brasilapi')]);

    const resultado = await service.lookup('01001000');

    expect(resultado.provider).toBe('brasilapi');
    expect(primeiro.calls).toBe(1);
  });

  it('devolve 503 com o histórico quando as duas APIs estão fora', async () => {
    const service = new CepService([fora('viacep'), fora('brasilapi')]);

    await expect(service.lookup('01001000')).rejects.toMatchObject({
      code: 'ALL_PROVIDERS_FAILED',
      status: 503,
      attempts: [
        { provider: 'viacep', code: 'PROVIDER_UNAVAILABLE' },
        { provider: 'brasilapi', code: 'PROVIDER_UNAVAILABLE' },
      ],
    });
  });

  it('devolve 504 quando as duas apenas demoraram demais', async () => {
    const service = new CepService([lento('viacep'), lento('brasilapi')]);

    await expect(service.lookup('01001000')).rejects.toMatchObject({
      code: 'ALL_PROVIDERS_FAILED',
      status: 504,
    });
  });

  it('devolve 404 (e não 503) quando as duas dizem que o CEP não existe', async () => {
    const service = new CepService([semCep('viacep'), semCep('brasilapi')]);

    await expect(service.lookup('99999998')).rejects.toMatchObject({
      code: 'CEP_NOT_FOUND',
      status: 404,
    });
  });

  it('recusa CEP inválido sem chamar nenhuma API', async () => {
    const viacep = ok('viacep');
    const service = new CepService([viacep]);

    await expect(service.lookup('123')).rejects.toMatchObject({ code: 'INVALID_CEP', status: 400 });
    await expect(service.lookup('abcdefgh')).rejects.toMatchObject({ code: 'INVALID_CEP' });
    expect(viacep.calls).toBe(0);
  });
});

describe('regras do CEP', () => {
  it('normaliza máscara e espaços', () => {
    expect(normalizeCep(' 01001-000 ')).toBe('01001000');
  });

  it('aceita 8 dígitos e recusa o resto', () => {
    expect(isValidCep('01001000')).toBe(true);
    expect(isValidCep('0100100')).toBe(false);
    expect(isValidCep('00000000')).toBe(false);
  });
});
