/**
 * Lê uma cor de `:root` em vez de repetir o hexadecimal no componente.
 *
 * O Leaflet desenha em canvas e só aceita cor como valor, não como
 * `var(--cor-acento)`. Sem esta ponte, os marcadores e os lotes seriam as
 * únicas cores do sistema fora da paleta. A reserva cobre a custom property
 * ausente.
 */
export function corDaPaleta(nome: string, reserva: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valor.length > 0 ? valor : reserva;
}
