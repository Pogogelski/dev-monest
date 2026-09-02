import { Injectable } from '@nestjs/common';
import { cepNotFound, providerUnavailable } from '../cep.errors.js';
import { normalizeCep } from '../cep.types.js';
import type { Address, CepProvider } from '../cep.types.js';
import { getJson } from './http.js';

@Injectable()
export class BrasilApiProvider implements CepProvider {
  readonly name = 'brasilapi';

  async lookup(cep: string, signal: AbortSignal): Promise<Address> {
    const url = `https://brasilapi.com.br/api/cep/v1/${cep}`;
    const { status, body } = await getJson(this.name, url, signal);

    // Aqui o "não existe" é um 404 honesto, diferente do ViaCEP.
    if (status === 404) throw cepNotFound(cep, this.name);
    if (status !== 200) throw providerUnavailable(this.name, `HTTP ${status}`);
    if (typeof body?.cep !== 'string') {
      throw providerUnavailable(this.name, 'resposta sem o campo cep');
    }

    return {
      cep: normalizeCep(body.cep),
      street: body.street ?? '',
      // A v1 da BrasilAPI não devolve complemento.
      complement: '',
      neighborhood: body.neighborhood ?? '',
      city: body.city ?? '',
      state: body.state ?? '',
    };
  }
}
