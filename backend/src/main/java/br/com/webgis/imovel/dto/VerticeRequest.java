package br.com.webgis.imovel.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/**
 * Um vertice do lote, em WGS 84.
 *
 * Mesmas faixas e mesma precisao do ponto do imovel: a coluna de coordenada e'
 * NUMERIC(10,7), entao aceitar mais casas aqui so' criaria vertice que o banco
 * arredonda em silencio.
 */
public record VerticeRequest(

		@NotNull(message = "Latitude do vértice é obrigatória")
		@DecimalMin(value = "-90", message = "Latitude deve estar entre -90 e 90")
		@DecimalMax(value = "90", message = "Latitude deve estar entre -90 e 90")
		@Digits(integer = 3, fraction = 7, message = "Latitude aceita até 7 casas decimais")
		BigDecimal latitude,

		@NotNull(message = "Longitude do vértice é obrigatória")
		@DecimalMin(value = "-180", message = "Longitude deve estar entre -180 e 180")
		@DecimalMax(value = "180", message = "Longitude deve estar entre -180 e 180")
		@Digits(integer = 3, fraction = 7, message = "Longitude aceita até 7 casas decimais")
		BigDecimal longitude

) {
}
