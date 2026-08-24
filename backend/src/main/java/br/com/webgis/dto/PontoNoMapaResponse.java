package br.com.webgis.dto;

import java.math.BigDecimal;

/**
 * Um imovel como ponto no mapa.
 *
 * Deliberadamente menor que o ImovelResponse: o mapa desenha centenas de
 * imoveis de uma vez e nao le bairro, rua, numero, area nem os timestamps —
 * reaproveitar o contrato da listagem dobraria os bytes por imovel para
 * entregar campos que a tela nao abre.
 */
public record PontoNoMapaResponse(
		Long id,
		String proprietario,
		String municipio,
		String uf,
		BigDecimal latitude,
		BigDecimal longitude,
		/**
		 * Poligono do lote em GeoJSON (WGS 84), ou nulo. Preenchido, o mapa
		 * desenha a area real; nulo, desenha so o ponto.
		 */
		String poligono,
		boolean ativo
) {
}
