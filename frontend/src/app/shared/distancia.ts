import { Vertice } from '../models/lote.model';

/** Raio médio da Terra, em metros. */
const RAIO_DA_TERRA = 6371000;

/**
 * Distância em metros entre dois pontos, pela fórmula de haversine.
 *
 * Aproximação esférica, como a do cálculo de área: erra em torno de 0,5% e é
 * usada aqui para responder "isto está perto ou longe?", não para medir terreno.
 */
export function distanciaEmMetros(de: Vertice, para: Vertice): number {
  const dLat = emRadianos(para.latitude - de.latitude);
  const dLon = emRadianos(para.longitude - de.longitude);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(emRadianos(de.latitude)) * Math.cos(emRadianos(para.latitude))
    * Math.sin(dLon / 2) ** 2;

  return 2 * RAIO_DA_TERRA * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "820 m", "4,5 km" — para caber numa frase, não para relatório. */
export function distanciaPorExtenso(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function emRadianos(graus: number): number {
  return graus * Math.PI / 180;
}
