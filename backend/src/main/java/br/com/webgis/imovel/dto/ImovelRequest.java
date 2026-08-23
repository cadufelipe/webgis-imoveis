package br.com.webgis.imovel.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import br.com.webgis.imovel.UfValida;
import br.com.webgis.proprietario.CpfValido;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * Contrato de entrada da API. Plano de proposito: o cliente nao conhece
 * os value objects Endereco e Coordenada do dominio.
 */
public record ImovelRequest(

		@NotBlank(message = "Proprietário é obrigatório")
		@Size(max = 120, message = "Proprietário deve ter no máximo {max} caracteres")
		String proprietario,

		/**
		 * CPF do proprietario, com ou sem pontuacao. Opcional.
		 *
		 * Quando vem, **e' ele quem identifica a pessoa**: CPF ja cadastrado liga
		 * o imovel aquele proprietario, mesmo que o nome tenha vindo escrito de
		 * outro jeito, e nenhum registro novo e' criado. Sem CPF, quem identifica
		 * e' o nome, como antes.
		 */
		@CpfValido
		String cpfDoProprietario,

		@NotBlank(message = "Município é obrigatório")
		@Size(max = 120, message = "Município deve ter no máximo {max} caracteres")
		String municipio,

		@NotBlank(message = "UF é obrigatória")
		@UfValida
		String uf,

		@Size(max = 100, message = "Bairro deve ter no máximo {max} caracteres")
		String bairro,

		@Size(max = 150, message = "Rua deve ter no máximo {max} caracteres")
		String rua,

		@Size(max = 10, message = "Número deve ter no máximo {max} caracteres")
		String numero,

		@NotNull(message = "Latitude é obrigatória")
		@DecimalMin(value = "-90", message = "Latitude deve estar entre -90 e 90")
		@DecimalMax(value = "90", message = "Latitude deve estar entre -90 e 90")
		@Digits(integer = 3, fraction = 7, message = "Latitude aceita até 7 casas decimais")
		BigDecimal latitude,

		@NotNull(message = "Longitude é obrigatória")
		@DecimalMin(value = "-180", message = "Longitude deve estar entre -180 e 180")
		@DecimalMax(value = "180", message = "Longitude deve estar entre -180 e 180")
		@Digits(integer = 3, fraction = 7, message = "Longitude aceita até 7 casas decimais")
		BigDecimal longitude,

		@Positive(message = "Área deve ser maior que zero")
		@Digits(integer = 10, fraction = 2, message = "Área aceita até 2 casas decimais")
		BigDecimal areaM2,

		/**
		 * Largura e comprimento em metros — o atalho para lote retangular.
		 * Opcionais, mas indivisiveis: informar so um dos dois e erro. Ignorados
		 * quando vem um poligono desenhado.
		 */
		@Positive(message = "Largura deve ser maior que zero")
		@Digits(integer = 8, fraction = 2, message = "Largura aceita até 2 casas decimais")
		BigDecimal largura,

		@Positive(message = "Comprimento deve ser maior que zero")
		@Digits(integer = 8, fraction = 2, message = "Comprimento aceita até 2 casas decimais")
		BigDecimal comprimento,

		/**
		 * Vertices do lote desenhado, em ordem, sem repetir o primeiro no fim —
		 * quem fecha o anel e' o GeoJsonDoLote.
		 *
		 * Quando vem preenchido, **manda em tudo**: a area passa a ser a do
		 * poligono, o ponto do imovel vai para dentro dele e largura/comprimento
		 * sao descartados. Dois desenhos do mesmo lote acabariam divergindo, e
		 * quem o usuario acredita e' o que esta no mapa.
		 *
		 * O teto de 500 vertices nao e' limite tecnico do PostGIS: e' o ponto em
		 * que a origem deixa de ser alguem desenhando um terreno.
		 */
		@Valid
		@Size(max = 500, message = "O lote aceita no máximo {max} vértices")
		List<VerticeRequest> poligono,

		Boolean ativo

) {
	/**
	 * Ausencia de "ativo" significa imovel ativo, e lista de vertices vazia
	 * significa lote nao desenhado — para o resto do codigo perguntar por nulo
	 * em um lugar so.
	 */
	public ImovelRequest {
		ativo = ativo == null ? Boolean.TRUE : ativo;
		poligono = poligono == null || poligono.isEmpty() ? null : List.copyOf(poligono);
	}

	public boolean temPoligono() {
		return poligono != null;
	}
}
