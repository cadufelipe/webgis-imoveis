package br.com.webgis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Corpo aceito na renomeacao de um proprietario. */
public record ProprietarioRequest(

		@NotBlank(message = "Nome é obrigatório")
		@Size(max = 120, message = "Nome deve ter no máximo {max} caracteres")
		String nome

) {
}
