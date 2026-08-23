package br.com.webgis.imovel;

import br.com.webgis.comum.PaginaResponse;
import br.com.webgis.imovel.dto.ImovelFiltro;
import br.com.webgis.imovel.dto.ImovelResponse;
import br.com.webgis.imovel.dto.MapaResponse;
import br.com.webgis.imovel.dto.PontoNoMapaResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Leituras. Agrupadas porque consulta nao tem invariante a proteger:
 * separa-las em uma classe por query seria cerimonia sem ganho.
 */
@Service
@Transactional(readOnly = true)
public class ConsultarImoveis {

	/**
	 * Teto de pontos devolvidos ao mapa, que e a unica tela sem paginacao.
	 *
	 * Sem ele, quem quebra primeiro nao e o servidor: e o navegador, tentando
	 * desenhar 200 mil marcadores. 500 e um limite de legibilidade, nao
	 * tecnico — acima disso os pontos viram mancha. Por isso a resposta manda
	 * tambem o total, para a tela pedir um filtro mais estreito em vez de
	 * fingir que 500 e tudo.
	 */
	private static final int LIMITE_DE_PONTOS = 500;

	/**
	 * Cortar em 500 exige decidir *quais* 500: sem ORDER BY o Postgres nao
	 * promete a mesma resposta duas vezes, e um F5 trocaria os pontos da tela.
	 * Por id, que e a ordenacao mais barata — o mapa nao tem ordem propria a
	 * respeitar, ao contrario da listagem.
	 */
	private static final Sort ORDEM_DO_MAPA = Sort.by(Sort.Direction.ASC, "id");

	private final ImovelRepository repository;

	public ConsultarImoveis(ImovelRepository repository) {
		this.repository = repository;
	}

	public PaginaResponse<ImovelResponse> listar(ImovelFiltro filtro, Pageable paginacao) {
		Page<Imovel> pagina = repository.findAll(ImovelSpecs.comFiltro(filtro), paginacao);
		return PaginaResponse.de(pagina, ImovelMapper::converterParaResposta);
	}

	/**
	 * Reusa ImovelSpecs.comFiltro de proposito: filtrar por proprietario no
	 * mapa e no grid tem que significar a mesma coisa, inclusive na busca sem
	 * acento.
	 *
	 * Page, e nao List, porque o total que a tela mostra ja vem dele: o findAll
	 * paginado emite o count na mesma chamada.
	 */
	public MapaResponse mapear(ImovelFiltro filtro) {
		Page<Imovel> recorte = repository.findAll(
				ImovelSpecs.comFiltro(filtro),
				PageRequest.of(0, LIMITE_DE_PONTOS, ORDEM_DO_MAPA));

		List<PontoNoMapaResponse> pontos = recorte.getContent().stream()
				.map(ImovelMapper::converterParaPonto)
				.toList();

		return MapaResponse.de(pontos, recorte.getTotalElements());
	}

	public ImovelResponse buscarPorId(Long id) {
		return repository.findById(id)
				.map(ImovelMapper::converterParaResposta)
				.orElseThrow(() -> new ImovelNaoEncontradoException(id));
	}
}
