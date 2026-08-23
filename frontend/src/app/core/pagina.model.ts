/**
 * Envelope de paginação devolvido pela API — espelha o PaginaResponse do backend.
 *
 * Mora em core/ porque não pertence a nenhuma feature: imóveis e proprietários
 * usam o mesmo formato, e deixá-lo dentro de uma delas obrigava a outra a
 * importar de uma pasta com a qual não tem relação de domínio.
 */
export interface Pagina<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  totalDeItens: number;
  totalDePaginas: number;
  primeira: boolean;
  ultima: boolean;
}

/**
 * Espelha o `@PageableDefault(size = 20)` do backend: se os dois discordarem, a
 * primeira página vem de um tamanho e as seguintes de outro.
 */
export const TAMANHO_DE_PAGINA_PADRAO = 20;

export const TAMANHOS_DE_PAGINA = [10, TAMANHO_DE_PAGINA_PADRAO, 50] as const;
