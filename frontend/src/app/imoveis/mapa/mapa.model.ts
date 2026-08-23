/**
 * Um imóvel como ponto no mapa — espelha o PontoNoMapaResponse do backend.
 *
 * Escrito por extenso, e não como `Pick<Imovel, …>`: são duas respostas
 * independentes da API que hoje se sobrepõem, e derivar uma da outra amarraria
 * o mapa a qualquer campo novo que a listagem viesse a expor.
 */
export interface PontoNoMapa {
  id: number;
  proprietario: string;
  municipio: string;
  uf: string;
  latitude: number;
  longitude: number;
  /**
   * Polígono do lote em GeoJSON (WGS 84), ou null. Chega como string porque é
   * assim que o Postgres devolve o `ST_AsGeoJSON`: desserializar no backend só
   * para serializar de novo seria trabalho puro.
   */
  poligono: string | null;
  ativo: boolean;
}

/**
 * Envelope da consulta do mapa — espelha o MapaResponse do backend.
 *
 * `total` é quantos imóveis atendem ao filtro, e não `pontos.length`: quando os
 * dois divergem, `truncado` é verdadeiro e a tela precisa dizer isso.
 */
export interface MapaDeImoveis {
  pontos: PontoNoMapa[];
  total: number;
  truncado: boolean;
}
