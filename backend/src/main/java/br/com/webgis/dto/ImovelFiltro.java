package br.com.webgis.dto;

import br.com.webgis.model.Endereco;
import br.com.webgis.util.TermoDeBusca;


/**
 * Filtros opcionais da listagem. Campo em branco significa "sem filtro".
 * A normalizacao acontece aqui para que nem a Specification nem o controller
 * precisem se defender de espaco em branco ou string vazia.
 */
public record ImovelFiltro(String proprietario, String municipio, String uf, Long proprietarioId) {

	public ImovelFiltro {
		proprietario = normalizar(proprietario);
		municipio = normalizar(municipio);
		uf = normalizarUf(uf);
	}

	public boolean temProprietario() {
		return proprietario != null;
	}

	public boolean temProprietarioId() {
		return proprietarioId != null;
	}

	public boolean temMunicipio() {
		return municipio != null;
	}

	public boolean temUf() {
		return uf != null;
	}

	public String proprietarioParaBusca() {
		return TermoDeBusca.contendo(proprietario);
	}

	public String municipioParaBusca() {
		return TermoDeBusca.contendo(municipio);
	}

	/**
	 * Sigla em caixa alta, para casar com o que o Endereco grava.
	 *
	 * Sigla inexistente **nao** e' descartada: nao casa com nada e devolve
	 * lista vazia. Ignorar o filtro invalido devolveria a base inteira, o que e'
	 * pior — pareceria que a busca funcionou.
	 */
	private static String normalizarUf(String valor) {
		if (valor == null || valor.isBlank()) {
			return null;
		}
		return valor.trim().toUpperCase();
	}

	private static String normalizar(String valor) {
		if (valor == null || valor.isBlank()) {
			return null;
		}
		return valor.trim();
	}
}
