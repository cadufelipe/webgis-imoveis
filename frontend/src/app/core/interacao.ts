/**
 * Espera entre a última tecla e o disparo da busca, em milissegundos.
 *
 * Não é arbitrário: abaixo de ~250ms a digitação normal já dispara requisição
 * por tecla; acima de ~500ms a lista parece travada.
 */
export const ESPERA_DO_FILTRO = 350;
