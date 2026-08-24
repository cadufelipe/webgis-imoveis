package br.com.webgis.model;

import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.validation.UfValida;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;

/**
 * Endereco do imovel. Imutavel: mudar de endereco e receber um novo, nao editar o atual.
 */
@Embeddable
@Getter
public class Endereco {

	@Column(nullable = false, length = 120)
	private String municipio;

	@Column(nullable = false, length = 2)
	private String uf;

	@Column(length = 100)
	private String bairro;

	@Column(length = 150)
	private String rua;

	/** Alfanumerico: aceita "120A", "S/N", "km 3". */
	@Column(length = 10)
	private String numero;

	/** Exigido pelo JPA. Nao usar no codigo da aplicacao. */
	protected Endereco() {
	}

	public Endereco(String municipio, String uf, String bairro, String rua, String numero) {
		if (municipio == null || municipio.isBlank()) {
			throw new DominioInvalidoException("Municipio e obrigatorio");
		}
		// Mesma regra da borda (@UfValida), aplicada de novo aqui de proposito:
		// a validacao do DTO protege a API, esta protege a entidade de qualquer
		// outro caminho de criacao — migracao, carga, teste, codigo futuro.
		// A lista nao esta duplicada: as duas perguntam ao mesmo enum.
		UnidadeFederativa unidade = UnidadeFederativa.porSigla(uf)
				.orElseThrow(() -> new DominioInvalidoException(
						"UF deve ser uma das 27 unidades federativas do Brasil"));

		this.municipio = municipio.trim();
		this.uf = unidade.getSigla();
		this.bairro = normalizar(bairro);
		this.rua = normalizar(rua);
		this.numero = normalizar(numero);
	}

	private static String normalizar(String valor) {
		if (valor == null || valor.isBlank()) {
			return null;
		}
		return valor.trim();
	}
}
