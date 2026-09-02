import { providerTimeout, providerUnavailable } from '../cep.errors.js';
import { CEP_TIMEOUT_MS } from '../cep.types.js';

/**
 * Um GET que já traduz falha de transporte em erro de domínio: nenhum erro cru
 * de rede escapa de um provider. O status volta sem interpretação — quem sabe o
 * que 404 significa é cada adapter.
 *
 * O corpo só é lido no 200: um 404 com página HTML (CDN, WAF na frente da API)
 * não pode virar "resposta inválida", senão um CEP inexistente seria contado
 * como API fora do ar.
 */
export async function getJson(
  provider: string,
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; body: any }> {
  try {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
    if (response.status !== 200) return { status: response.status, body: null };
    return { status: 200, body: await response.json() };
  } catch (error) {
    if (signal.aborted) throw providerTimeout(provider, CEP_TIMEOUT_MS);
    if (error instanceof SyntaxError) throw providerUnavailable(provider, 'resposta não é JSON');
    // O fetch esconde o motivo real (ENOTFOUND, ECONNRESET) dentro de `cause`.
    const cause = (error as Error).cause as { code?: string } | undefined;
    throw providerUnavailable(provider, cause?.code ?? String(error));
  }
}
