import { Controller, Get, Param, Req } from '@nestjs/common';
import { CepService } from './cep.service.js';
import type { CepResponse } from './cep.types.js';
import type { RequestWithId } from '../common/request-id.middleware.js';

@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  // Sem try/catch: quem traduz erro em status HTTP é o AllExceptionsFilter,
  // assim a regra fica em um lugar só.
  @Get(':cep')
  lookup(@Param('cep') cep: string, @Req() req: RequestWithId): Promise<CepResponse> {
    return this.cepService.lookup(cep, req.requestId);
  }
}
