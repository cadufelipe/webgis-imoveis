package br.com.webgis.dto;

import br.com.webgis.mapper.ImovelMapper;
import br.com.webgis.service.GravarGeometriaDoLote;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Contrato de saida da API. Plano, sem logica: quem traduz e o ImovelMapper.
 */
public record ImovelResponse(
		Long id,
		Long proprietarioId,
		String proprietario,
		/** So digitos, ou nulo para proprietario cadastrado antes da V9. */
		String cpfDoProprietario,
		/** So digitos, ou nulo. A mascara com hifen e' decisao de tela. */
		String cep,
		String municipio,
		String uf,
		String bairro,
		String rua,
		String numero,
		BigDecimal latitude,
		BigDecimal longitude,
		BigDecimal areaM2,
		BigDecimal largura,
		BigDecimal comprimento,

		/**
		 * Poligono do lote em GeoJSON (WGS 84), ou nulo.
		 *
		 * Ate a V7 este campo nao existia aqui, porque a @Formula que o le nao e'
		 * preenchida por INSERT nem UPDATE e a resposta da criacao viria sempre
		 * nula. Agora o GravarGeometriaDoLote recarrega a entidade depois de
		 * gravar, e o valor e' o mesmo em POST, PUT e GET.
		 *
		 * A tela de edicao depende disto: sem o poligono na resposta, abrir um
		 * imovel para editar apagaria o lote desenhado.
		 */
		String poligono,

		boolean ativo,
		OffsetDateTime criadoEm,
		OffsetDateTime atualizadoEm
) {
}
