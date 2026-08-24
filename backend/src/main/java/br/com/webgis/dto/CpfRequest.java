package br.com.webgis.dto;

import br.com.webgis.validation.CpfValido;

import jakarta.validation.constraints.NotBlank;

/**
 * Corpo aceito ao informar o documento de um proprietario que ainda nao tem.
 *
 * So o CPF: nome nao entra aqui de proposito. Quem chama ja escolheu **qual**
 * registro esta documentando — se pudesse mandar nome junto, a rota viraria um
 * segundo caminho de edicao, concorrendo com o PUT que renomeia.
 */
public record CpfRequest(

		@NotBlank(message = "CPF é obrigatório")
		@CpfValido
		String cpf

) {
}
