/**
 * Filtros da listagem de imóveis — espelha o ImovelFiltro do backend.
 * String vazia significa "sem filtro".
 */
export interface FiltroImoveis {
  proprietario: string;
  municipio: string;
}

export const FILTRO_VAZIO: FiltroImoveis = {
  proprietario: '',
  municipio: '',
};
