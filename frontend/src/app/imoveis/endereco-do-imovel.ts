import { Imovel } from './imovel.model';

/**
 * Endereço em uma linha, para a coluna das tabelas.
 *
 * Função, e não pipe, porque as duas telas a chamam dentro de um `computed`:
 * formata uma vez por mudança do store, e não a cada ciclo de renderização.
 */
export function enderecoDoImovel(imovel: Imovel): string {
  const partes = [imovel.rua, imovel.numero, imovel.bairro].filter(parte => parte !== null);
  return partes.length > 0 ? partes.join(', ') : '—';
}
