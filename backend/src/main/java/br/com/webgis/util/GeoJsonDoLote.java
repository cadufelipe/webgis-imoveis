package br.com.webgis.util;


import br.com.webgis.dto.VerticeRequest;
import br.com.webgis.exception.DominioInvalidoException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/**
 * Converte os vertices recebidos da API no GeoJSON que o PostGIS le.
 *
 * Existe porque o poligono nunca vira objeto Java: ele sai daqui como texto e
 * chega ao banco em `ST_GeomFromGeoJSON`, que reprojeta e grava. Trazer o
 * hibernate-spatial e o JTS so' para transportar uma lista de pares seria
 * dependencia sem contrapartida.
 *
 * **A ordem dos eixos e' a armadilha deste arquivo.** GeoJSON e' `[longitude,
 * latitude]`, o inverso de como o mundo fala e de como a API recebe. Trocar os
 * dois compila, roda, e grava o terreno do Parana na Somalia.
 */
public final class GeoJsonDoLote {

	/**
	 * Tres vertices distintos e o minimo para existir area. Com dois, o
	 * ST_GeomFromGeoJSON ainda monta a geometria, e o que se grava e' um risco
	 * de area zero que a validacao de sobreposicao nunca acusaria.
	 */
	private static final int MINIMO_DE_VERTICES = 3;

	private GeoJsonDoLote() {
	}

	public static String de(List<VerticeRequest> vertices) {
		List<VerticeRequest> anel = semRepeticoesConsecutivas(vertices);

		if (anel.size() < MINIMO_DE_VERTICES) {
			throw new DominioInvalidoException(
					"O lote precisa de pelo menos " + MINIMO_DE_VERTICES + " pontos distintos");
		}

		// O anel fecha voltando ao primeiro vertice. E' exigencia do formato: sem
		// isto o ST_GeomFromGeoJSON recusa o poligono.
		StringJoiner posicoes = new StringJoiner(",", "[", "]");
		anel.forEach(vertice -> posicoes.add(posicao(vertice)));
		posicoes.add(posicao(anel.get(0)));

		return "{\"type\":\"Polygon\",\"coordinates\":[" + posicoes + "]}";
	}

	/**
	 * Clique repetido no mesmo lugar, ou o desenho fechado clicando de novo no
	 * primeiro ponto, produzem vertices iguais em sequencia — que tornam o
	 * poligono invalido para o ST_IsValid. Limpar aqui evita recusar um desenho
	 * que, para quem o fez, esta correto.
	 */
	private static List<VerticeRequest> semRepeticoesConsecutivas(List<VerticeRequest> vertices) {
		List<VerticeRequest> limpos = new ArrayList<>(vertices.size());

		for (VerticeRequest vertice : vertices) {
			if (limpos.isEmpty() || !mesmoPonto(limpos.get(limpos.size() - 1), vertice)) {
				limpos.add(vertice);
			}
		}

		// O ultimo tambem nao pode repetir o primeiro: quem fecha o anel e' o de().
		if (limpos.size() > 1 && mesmoPonto(limpos.get(0), limpos.get(limpos.size() - 1))) {
			limpos.remove(limpos.size() - 1);
		}

		return limpos;
	}

	/** compareTo, e nao equals: 1.50 e 1.5 sao o mesmo ponto e BigDecimals diferentes. */
	private static boolean mesmoPonto(VerticeRequest um, VerticeRequest outro) {
		return um.latitude().compareTo(outro.latitude()) == 0
				&& um.longitude().compareTo(outro.longitude()) == 0;
	}

	private static String posicao(VerticeRequest vertice) {
		return "[" + numero(vertice.longitude()) + "," + numero(vertice.latitude()) + "]";
	}

	/** toPlainString para coordenada pequena nao virar notacao cientifica no JSON. */
	private static String numero(BigDecimal valor) {
		return valor.toPlainString();
	}
}
