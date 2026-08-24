/** Um vértice do lote, em WGS 84 — espelha o VerticeRequest do backend. */
export interface Vertice {
  latitude: number;
  longitude: number;
}

interface PoligonoGeoJson {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/**
 * Lê os vértices de um polígono GeoJSON vindo da API.
 *
 * **GeoJSON é [longitude, latitude]**, o inverso da ordem que o resto do
 * sistema usa. Trocar os dois compila, roda, e põe o terreno do Paraná na
 * Somália.
 *
 * Descarta o último ponto: o formato exige que o anel feche repetindo o
 * primeiro, e para desenhar isso seria um vértice fantasma em cima de outro.
 *
 * O `try` cobre texto vindo da rede — payload truncado devolve null em vez de
 * derrubar a tela.
 */
export function verticesDoGeoJson(poligono: string | null): Vertice[] | null {
  if (poligono === null) {
    return null;
  }

  try {
    const geometria = JSON.parse(poligono) as PoligonoGeoJson;
    const anel = geometria.coordinates.at(0);

    if (anel === undefined || anel.length < 4) {
      return null;
    }

    return anel
      .slice(0, -1)
      .map(([longitude, latitude]): Vertice => ({ latitude, longitude }));
  } catch {
    return null;
  }
}
