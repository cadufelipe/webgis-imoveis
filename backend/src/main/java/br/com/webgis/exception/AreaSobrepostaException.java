package br.com.webgis.exception;

import lombok.Getter;

/**
 * A area do lote informado invade a de um imovel ja cadastrado.
 *
 * E' `409 Conflict`, e nao `400`: o pedido esta bem formado, o que conflita e o
 * estado atual do cadastro. Carrega o id do imovel conflitante para a resposta
 * poder dizer com quem, em vez de deixar o usuario procurar.
 */
@Getter
public class AreaSobrepostaException extends RuntimeException {

	private final Long idDoImovelConflitante;

	public AreaSobrepostaException(Long idDoImovelConflitante) {
		super("A área informada conflita com a de outro imóvel já cadastrado.");
		this.idDoImovelConflitante = idDoImovelConflitante;
	}
}
