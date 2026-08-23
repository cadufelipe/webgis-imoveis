package br.com.webgis.imovel;

import java.util.Optional;

/**
 * As 27 unidades federativas do Brasil — 26 estados mais o Distrito Federal.
 *
 * Enum, e nao tabela no banco: a lista tem 27 itens e nao muda desde 1988. Uma
 * tabela custaria uma migration, um join na leitura e uma consulta por cadastro
 * para validar algo que o compilador ja garante.
 */
public enum UnidadeFederativa {

	AC("Acre"),
	AL("Alagoas"),
	AP("Amapá"),
	AM("Amazonas"),
	BA("Bahia"),
	CE("Ceará"),
	DF("Distrito Federal"),
	ES("Espírito Santo"),
	GO("Goiás"),
	MA("Maranhão"),
	MT("Mato Grosso"),
	MS("Mato Grosso do Sul"),
	MG("Minas Gerais"),
	PA("Pará"),
	PB("Paraíba"),
	PR("Paraná"),
	PE("Pernambuco"),
	PI("Piauí"),
	RJ("Rio de Janeiro"),
	RN("Rio Grande do Norte"),
	RS("Rio Grande do Sul"),
	RO("Rondônia"),
	RR("Roraima"),
	SC("Santa Catarina"),
	SP("São Paulo"),
	SE("Sergipe"),
	TO("Tocantins");

	private final String nome;

	UnidadeFederativa(String nome) {
		this.nome = nome;
	}

	public String getNome() {
		return nome;
	}

	public String getSigla() {
		return name();
	}

	/**
	 * Aceita a sigla em qualquer caixa e com espacos, porque e' assim que ela
	 * chega de um formulario. Devolve vazio em vez de lancar: quem chama decide
	 * se a ausencia e' erro de validacao ou filtro que nao casou.
	 */
	public static Optional<UnidadeFederativa> porSigla(String sigla) {
		if (sigla == null || sigla.isBlank()) {
			return Optional.empty();
		}
		try {
			return Optional.of(valueOf(sigla.trim().toUpperCase()));
		} catch (IllegalArgumentException naoExiste) {
			return Optional.empty();
		}
	}

	public static boolean existe(String sigla) {
		return porSigla(sigla).isPresent();
	}
}
