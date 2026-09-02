# API de CEP

API que consulta CEP em duas fontes externas (ViaCEP e BrasilAPI) e continua
funcionando quando uma delas falha.

```bash
npm install
npm run start:dev     # http://localhost:3000
npm test              # unitários
npm run test:e2e      # a API inteira, com as APIs externas mockadas
```

## Endpoint

```
GET /cep/:cep
```

O CEP pode vir com ou sem máscara (`01001-000` ou `01001000`).

**200** — o mesmo contrato, não importa qual API respondeu:

```json
{
  "cep": "01001000",
  "street": "Praça da Sé",
  "complement": "lado ímpar",
  "neighborhood": "Sé",
  "city": "São Paulo",
  "state": "SP",
  "provider": "viacep",
  "durationMs": 137
}
```

**Erro** — sempre com um `code` estável, para o cliente programar em cima dele:

```json
{
  "statusCode": 503,
  "code": "ALL_PROVIDERS_FAILED",
  "message": "Nenhum provider respondeu para o CEP 01001000: viacep=PROVIDER_TIMEOUT, brasilapi=PROVIDER_UNAVAILABLE",
  "requestId": "9f1c2e3a-...",
  "path": "/cep/01001000",
  "timestamp": "2026-09-01T23:45:38.021Z",
  "attempts": [
    { "provider": "viacep", "code": "PROVIDER_TIMEOUT", "durationMs": 2501 },
    { "provider": "brasilapi", "code": "PROVIDER_UNAVAILABLE", "durationMs": 88 }
  ]
}
```

## Abstração

Os providers externos ficam atrás de uma interface. O serviço não sabe que
ViaCEP ou BrasilAPI existem — só conhece isto:

```ts
export interface CepProvider {
  readonly name: string;
  lookup(cep: string, signal: AbortSignal): Promise<Address>;
}
```

Cada provider traduz o payload da sua API para o `Address` e traduz qualquer
falha para os erros de domínio. Nenhum erro cru de rede vaza.

**Para adicionar uma terceira API**, mudam duas coisas:

1. um arquivo novo em `src/cep/providers/` implementando `CepProvider`;
2. o nome da classe no array de `cep.module.ts`.

```ts
{
  provide: CEP_PROVIDERS,
  useFactory: (viaCep, brasilApi) => [viaCep, brasilApi],
  inject: [ViaCepProvider, BrasilApiProvider],
}
```

Serviço, controller, contrato de saída e tratamento de erro não mudam.

## Resiliência

| Situação | O que acontece |
|---|---|
| Uma API demora | Cada tentativa tem prazo próprio (`AbortSignal.timeout`, 2,5s). Estourou, é falha e vai para a próxima |
| Uma API falha | Failover automático para a outra, na mesma requisição |
| As duas falham | `503` (ou `504` se as duas só demoraram) com o histórico de cada tentativa |
| CEP não existe | `404` — só quando **as duas** disseram que não existe, porque as bases não são idênticas |
| Carga | Round-robin: a cada chamada a lista começa em uma API diferente, então nenhuma é ponto único de falha |

O pior caso de latência é limitado e previsível: `timeout × nº de providers`
(hoje 2 × 2,5s = 5s), nunca os 30s da API externa.

## Observabilidade

- **`x-request-id`** em toda requisição — herdado de quem chamou (se for um valor
  seguro) ou gerado. Volta no header da resposta e no corpo do erro.
- **Uma linha de log por requisição** (`método`, `url`, `status`, `durationMs`),
  no middleware, então até rota inexistente aparece no log.
- **Uma linha por tentativa de provider** (`provider`, `outcome`, `code`,
  `durationMs`) — é assim que se descobre *qual* API caiu e *quanto* ela demorou.
- O `attempts` no corpo do erro conta ao cliente o que aconteceu, mas só com o
  código da falha: a mensagem crua fica no log, porque pode conter URL interna.

## Tratamento de erros

Todo erro carrega o seu código e o seu status HTTP.

| Erro | Status | Quando |
|---|---|---|
| `INVALID_CEP` | 400 | CEP malformado — nem chega a chamar API externa |
| `CEP_NOT_FOUND` | 404 | Todas as APIs responderam que o CEP não existe |
| `ALL_PROVIDERS_FAILED` | 503 | Todas falharam, por motivos variados |
| `ALL_PROVIDERS_FAILED` | 504 | Todas falharam **por timeout** |

Um `AllExceptionsFilter` global é o único lugar que traduz erro em resposta HTTP.
Nenhum controller tem `try/catch`.

Detalhe que importa: um `404` de uma API é resposta **saudável**, não falha — por
isso ele não é contado como indisponibilidade, e a busca continua na outra base.

## Configuração

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `CEP_TIMEOUT_MS` | `2500` | Prazo de cada tentativa |

## Estrutura

```
src/
├── main.ts                       bootstrap + filter global
├── app.module.ts                 monta o app e o middleware
├── cep/
│   ├── cep.module.ts             registra os providers (ponto de extensão)
│   ├── cep.controller.ts         GET /cep/:cep
│   ├── cep.service.ts            timeout, failover e round-robin
│   ├── cep.types.ts              contrato Address/CepProvider + regras do CEP
│   ├── cep.errors.ts             um erro com código e status por causa
│   └── providers/
│       ├── http.ts               fetch + tradução de falha de rede
│       ├── viacep.provider.ts
│       └── brasilapi.provider.ts
└── common/
    ├── request-id.middleware.ts  id de correlação + log de acesso
    └── all-exceptions.filter.ts  erro de domínio -> resposta HTTP
```

## Testes

24 testes, nenhum toca a internet e nenhum espera tempo real.

```
npm test        # serviço (failover, round-robin, 404 x 503) e providers
npm run test:e2e  # a API de ponta a ponta, com fetch mockado
```

## O que eu deixaria para depois

- **Circuit breaker**: hoje, se uma API está fora, toda requisição ainda gasta
  2,5s tentando antes do failover. Um breaker faria falhar rápido.
- **Cache**: CEP quase não muda; um cache curto tiraria carga das APIs e serviria
  de resposta quando as duas estiverem fora.
- **Métricas** (Prometheus) além dos logs, para alarme por taxa de erro por provider.
