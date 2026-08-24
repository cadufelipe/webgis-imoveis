package br.com.webgis.model;

import br.com.webgis.exception.DominioInvalidoException;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;

import java.math.BigDecimal;

/**
 * Largura e comprimento do lote, em metros.
 *
 * Objeto de valor pelo mesmo motivo de Endereco e Coordenada: os dois campos so
 * fazem sentido juntos, e o tipo torna a meia dimensao impossivel de
 * representar — em vez de virar condicao espalhada por quem usa.
 *
 * O banco repete a regra na constraint ck_imovel_dimensoes_completas: aqui
 * protege quem passa pelo dominio, la protege a tabela de qualquer caminho.
 */
@Embeddable
@Getter
public class Dimensoes {

	@Column(precision = 10, scale = 2)
	private BigDecimal largura;

	@Column(precision = 10, scale = 2)
	private BigDecimal comprimento;

	/** Exigido pelo JPA. Nao usar no codigo da aplicacao. */
	protected Dimensoes() {
	}

	public Dimensoes(BigDecimal largura, BigDecimal comprimento) {
		if (largura == null || comprimento == null) {
			throw new DominioInvalidoException(
					"Informe largura e comprimento juntos, ou nenhum dos dois");
		}
		if (largura.signum() <= 0 || comprimento.signum() <= 0) {
			throw new DominioInvalidoException("Largura e comprimento devem ser maiores que zero");
		}
		this.largura = largura;
		this.comprimento = comprimento;
	}

	/**
	 * Havendo dimensoes, e' esta a area do imovel: o valor digitado no campo de
	 * area passa a ser ignorado.
	 */
	public BigDecimal area() {
		return largura.multiply(comprimento);
	}
}
