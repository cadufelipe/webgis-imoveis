package br.com.webgis.util;

import java.text.Normalizer;

/**
 * Preparo de termos para busca textual.
 *
 * A contraparte no banco e a funcao sem_acento() da migration V3, que aplica
 * lower() e unaccent() na coluna. Aqui o termo passa pela mesma transformacao,
 * e e' por isso que "sao" encontra "Sao Paulo" escrito com til.
 */
public final class TermoDeBusca {

	private static final String CURINGA = "%";

	/** Regex de marcas diacriticas (acentos), que a decomposicao NFD isola. */
	private static final String DIACRITICOS = "\\p{M}";

	private TermoDeBusca() {
	}

	/**
	 * Termo pronto para LIKE. Valor ausente devolve apenas o curinga, o que
	 * dispensa condicional de "sem filtro" em JPQL.
	 */
	public static String contendo(String valor) {
		if (valor == null || valor.isBlank()) {
			return CURINGA;
		}
		return CURINGA + semAcento(valor.trim()) + CURINGA;
	}

	private static String semAcento(String valor) {
		String decomposto = Normalizer.normalize(valor, Normalizer.Form.NFD);
		return decomposto.replaceAll(DIACRITICOS, "").toLowerCase();
	}
}
