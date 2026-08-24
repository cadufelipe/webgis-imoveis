/**
 * Mensagem sobre a última ação do usuário. O tom decide cor e `role`: sucesso e
 * falha dividem o mesmo espaço na tela, e sem ele quem lê rápido — ou usa
 * leitor de tela — não distingue "excluído" de "não foi possível excluir".
 */
export type TomDaMensagem = 'sucesso' | 'erro';

export interface Mensagem {
  texto: string;
  tom: TomDaMensagem;
}
