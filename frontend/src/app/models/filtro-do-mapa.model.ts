/**
 * Filtros do mapa — espelha o que o `GET /api/imoveis/mapa` aceita.
 *
 * Tipo próprio, e não o `FiltroImoveis` da listagem: acrescentar `uf` ao tipo
 * compartilhado obrigaria o formulário da listagem, que tem dois campos, a
 * declarar um terceiro que não usa só para o `setValue` compilar no `strict`.
 * A duplicação é de forma — a regra continua uma só, no `ImovelSpecs`.
 */
export interface FiltroDoMapa {
  proprietario: string;
  uf: string;
  municipio: string;
}

export const FILTRO_DO_MAPA_VAZIO: FiltroDoMapa = {
  proprietario: '',
  uf: '',
  municipio: '',
};
