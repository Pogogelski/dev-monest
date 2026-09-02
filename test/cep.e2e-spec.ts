import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter.js';

const VIACEP = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
};

const BRASILAPI = {
  cep: '01001-000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
};

/** Roteia o fetch falso por URL: nenhum teste sai para a internet. */
function stubFetch(rotas: { viacep: () => unknown; brasilapi: () => unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.includes('viacep') ? rotas.viacep() : rotas.brasilapi())),
  );
}

const ok = (body: unknown) => () => ({ status: 200, json: async () => body });
const status = (code: number) => () => ({ status: code, json: async () => null });

describe('API de CEP (e2e)', () => {
  let app: INestApplication;

  beforeAll(() => Logger.overrideLogger(false));

  // App novo a cada teste para o round-robin sempre começar no viacep.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it('devolve 200 com o contrato único e um x-request-id', async () => {
    stubFetch({ viacep: ok(VIACEP), brasilapi: ok(BRASILAPI) });

    const res = await request(app.getHttpServer()).get('/cep/01001-000').expect(200);

    expect(res.body).toMatchObject({
      cep: '01001000',
      street: 'Praça da Sé',
      neighborhood: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      provider: 'viacep',
    });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('cai para a segunda API quando a primeira devolve 500', async () => {
    stubFetch({ viacep: status(500), brasilapi: ok(BRASILAPI) });

    const res = await request(app.getHttpServer()).get('/cep/01001000').expect(200);

    expect(res.body.provider).toBe('brasilapi');
  });

  it('devolve 400 INVALID_CEP sem tocar na rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app.getHttpServer()).get('/cep/123').expect(400);

    expect(res.body.code).toBe('INVALID_CEP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devolve 404 quando nenhuma das duas conhece o CEP', async () => {
    stubFetch({ viacep: ok({ erro: 'true' }), brasilapi: status(404) });

    const res = await request(app.getHttpServer()).get('/cep/99999998').expect(404);

    expect(res.body.code).toBe('CEP_NOT_FOUND');
  });

  it('devolve 503 com o histórico das tentativas quando as duas estão fora', async () => {
    stubFetch({ viacep: status(500), brasilapi: status(503) });

    const res = await request(app.getHttpServer()).get('/cep/01001000').expect(503);

    expect(res.body.code).toBe('ALL_PROVIDERS_FAILED');
    expect(res.body.attempts).toHaveLength(2);
    expect(res.body.attempts[0]).toMatchObject({
      provider: 'viacep',
      code: 'PROVIDER_UNAVAILABLE',
    });
    // A mensagem crua fica só no log: ela pode conter URL interna.
    expect(res.body.attempts[0].message).toBeUndefined();
  });

  it('reaproveita um x-request-id válido e descarta um suspeito', async () => {
    stubFetch({ viacep: ok(VIACEP), brasilapi: ok(BRASILAPI) });

    const bom = await request(app.getHttpServer())
      .get('/cep/01001000')
      .set('x-request-id', 'pedido-12345');
    expect(bom.headers['x-request-id']).toBe('pedido-12345');

    const ruim = await request(app.getHttpServer())
      .get('/cep/01001000')
      .set('x-request-id', 'id com espaco');
    expect(ruim.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
