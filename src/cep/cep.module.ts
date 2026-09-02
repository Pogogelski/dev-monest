import { Module } from '@nestjs/common';
import { CepController } from './cep.controller.js';
import { CepService } from './cep.service.js';
import { CEP_PROVIDERS } from './cep.types.js';
import { BrasilApiProvider } from './providers/brasilapi.provider.js';
import { ViaCepProvider } from './providers/viacep.provider.js';

@Module({
  controllers: [CepController],
  providers: [
    ViaCepProvider,
    BrasilApiProvider,
    CepService,
    // Ponto único de extensão: uma terceira API é uma classe nova aqui dentro.
    // A ordem do array é a ordem de fallback.
    {
      provide: CEP_PROVIDERS,
      useFactory: (viaCep: ViaCepProvider, brasilApi: BrasilApiProvider) => [viaCep, brasilApi],
      inject: [ViaCepProvider, BrasilApiProvider],
    },
  ],
})
export class CepModule {}
