/**
 * Envelope de paginação devolvido pela API — espelha o PaginaResponse do backend.
 *
 * Serve às três listagens do sistema — imóveis, proprietários e imóveis de um
 * proprietário —, que compartilham o mesmo envelope.
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
