import { Injectable } from '@nestjs/common';
import { cepNotFound, providerUnavailable } from '../cep.errors.js';
import { normalizeCep } from '../cep.types.js';
import type { Address, CepProvider } from '../cep.types.js';
import { getJson } from './http.js';

@Injectable()
export class ViaCepProvider implements CepProvider {
  readonly name = 'viacep';

  async lookup(cep: string, signal: AbortSignal): Promise<Address> {
    const url = `https://viacep.com.br/ws/${cep}/json/`;
    const { status, body } = await getJson(this.name, url, signal);

    if (status !== 200) throw providerUnavailable(this.name, `HTTP ${status}`);
    // CEP inexistente vem 200 com `erro`, ora boolean true, ora string "true".
    if (body?.erro === true || body?.erro === 'true') throw cepNotFound(cep, this.name);
    if (typeof body?.cep !== 'string') {
      throw providerUnavailable(this.name, 'resposta sem o campo cep');
    }

    return {
      cep: normalizeCep(body.cep),
      street: body.logradouro ?? '',
      complement: body.complemento ?? '',
      neighborhood: body.bairro ?? '',
      city: body.localidade ?? '',
      state: body.uf ?? '',
    };
  }
}
