import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Filter global: nenhum controller precisa repetir try/catch.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
