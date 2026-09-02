import { Module, RequestMethod } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { CepModule } from './cep/cep.module.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';

@Module({
  imports: [CepModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Antes de qualquer handler: toda requisição ganha (ou herda) um id.
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
