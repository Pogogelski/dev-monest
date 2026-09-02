import 'reflect-metadata';
import { BrasilApiProvider } from './brasilapi.provider.js';
import { ViaCepProvider } from './viacep.provider.js';

/** Resposta falsa no formato mínimo que o getJson consome. */
const resposta = (status: number, body: unknown) => ({ status, json: async () => body });

const ENDERECO = {
  cep: '01001000',
  street: 'Praça da Sé',
  complement: 'lado ímpar',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
};

const aberto = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe('ViaCepProvider', () => {
  const provider = new ViaCepProvider();

  it('chama a URL certa e traduz o payload para o contrato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      resposta(200, {
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        complemento: 'lado ímpar',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
        ibge: '3550308',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const address = await provider.lookup('01001000', aberto);

    expect(fetchMock.mock.calls[0][0]).toBe('https://viacep.com.br/ws/01001000/json/');
    // toEqual (e não toMatchObject) prova que campos extras da API foram descartados.
    expect(address).toEqual(ENDERECO);
  });

  it.each([true, 'true'])('trata 200 com erro=%s como CEP não encontrado', async (erro) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(200, { erro })));

    await expect(provider.lookup('99999998', aberto)).rejects.toMatchObject({
      code: 'CEP_NOT_FOUND',
    });
  });

  it('trata 500 como provider indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(500, null)));

    await expect(provider.lookup('01001000', aberto)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('BrasilApiProvider', () => {
  const provider = new BrasilApiProvider();

  it('chama a URL certa e traduz o payload para o contrato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      resposta(200, {
        cep: '01001-000',
        state: 'SP',
        city: 'São Paulo',
        neighborhood: 'Sé',
        street: 'Praça da Sé',
        service: 'correios',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const address = await provider.lookup('01001000', aberto);

    expect(fetchMock.mock.calls[0][0]).toBe('https://brasilapi.com.br/api/cep/v1/01001000');
    expect(address).toEqual({ ...ENDERECO, complement: '' });
  });

  it('trata 404 como CEP não encontrado, mesmo com corpo que não é JSON', async () => {
    // Um CDN na frente da API pode devolver 404 com página HTML: continua sendo
    // "não existe", nunca uma falha do provider.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    await expect(provider.lookup('99999998', aberto)).rejects.toMatchObject({
      code: 'CEP_NOT_FOUND',
    });
  });

  it('trata 200 sem o campo cep como provider indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(200, { mensagem: 'oi' })));

    await expect(provider.lookup('01001000', aberto)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('falha de transporte', () => {
  it('signal abortado vira PROVIDER_TIMEOUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );

    await expect(
      new ViaCepProvider().lookup('01001000', AbortSignal.abort()),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  });

  it('erro de rede vira PROVIDER_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      ),
    );

    await expect(
      new BrasilApiProvider().lookup('01001000', aberto),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
