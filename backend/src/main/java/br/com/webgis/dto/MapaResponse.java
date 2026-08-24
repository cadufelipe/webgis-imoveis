package br.com.webgis.dto;

import java.util.List;

/**
 * Envelope da consulta do mapa.
 *
 * Existe porque uma lista crua nao consegue dizer que foi cortada: a tela
 * desenharia 500 pontos de 12.430 sem nada avisando, e quem olhasse concluiria
 * que o cadastro tem 500 imoveis.
 *
 * `total` e quantos imoveis atendem ao filtro, e nao o tamanho de `pontos`. E'
 * a diferenca entre os dois que leva a tela a pedir um filtro mais estreito.
 */
public record MapaResponse(List<PontoNoMapaResponse> pontos, long total, boolean truncado) {

	/**
	 * `truncado` e componente do record, e nao um metodo derivado, porque so
	 * componentes entram no JSON de forma garantida. Calculado uma vez aqui,
	 * servidor e cliente nao tem como discordar.
	 */
	public static MapaResponse de(List<PontoNoMapaResponse> pontos, long total) {
		return new MapaResponse(pontos, total, total > pontos.size());
	}
}
