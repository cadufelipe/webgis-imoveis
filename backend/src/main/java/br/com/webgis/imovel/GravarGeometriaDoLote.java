package br.com.webgis.imovel;

import br.com.webgis.comum.DominioInvalidoException;
import br.com.webgis.imovel.dto.ImovelRequest;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;

/**
 * Poe no banco a geometria do lote, desenhada ou retangular.
 *
 * Ate a V7 isto era uma coluna gerada e nao existia codigo nenhum. Com o
 * poligono livre, `geom` virou dado de entrada — e este servico e' o unico
 * lugar que a escreve, para que a regra de precedencia (poligono vence
 * dimensoes) exista uma vez so, e nao repetida em CriarImovel e AtualizarImovel.
 *
 * Sem @Transactional pelo mesmo motivo do VerificarSobreposicao: roda sempre
 * dentro da transacao do caso de uso, e o refresh do fim depende disso.
 */
@Service
public class GravarGeometriaDoLote {

	private final ImovelRepository repository;
	private final EntityManager entityManager;

	public GravarGeometriaDoLote(ImovelRepository repository, EntityManager entityManager) {
		this.repository = repository;
		this.entityManager = entityManager;
	}

	/**
	 * Chamado **depois** do save, e nao antes: o UPDATE precisa do id, e o id so'
	 * existe depois de a linha ter sido inserida.
	 */
	public void aplicarEm(Imovel imovel, ImovelRequest req) {
		if (req.temPoligono()) {
			gravarDesenho(imovel, GeoJsonDoLote.de(req.poligono()));
		} else {
			repository.remontarLoteRetangular(imovel.getId());
		}

		// A entidade em memoria nao viu nenhum dos updates acima — eles saem em
		// SQL nativo, por fora do contexto de persistencia. Sem este refresh a
		// resposta devolveria a area digitada em vez da area do lote, e o
		// poligono viria nulo, porque a @Formula so' e' lida quando a linha e'
		// carregada do banco.
		entityManager.refresh(imovel);
	}

	private void gravarDesenho(Imovel imovel, String geojson) {
		repository.motivoDePoligonoInvalido(geojson)
				.ifPresent(motivo -> {
					throw new DominioInvalidoException(emPortugues(motivo));
				});

		repository.gravarLoteDesenhado(imovel.getId(), geojson);
	}

	/**
	 * O ST_IsValidReason responde em ingles e com a coordenada do problema **em
	 * UTM** — "Self-intersection[669937.49 7183015.61]". E' o que se quer no log
	 * de quem investiga, e nao serve para quem esta desenhando um terreno: nem o
	 * idioma nem o sistema de coordenadas sao os dele.
	 */
	private String emPortugues(String motivo) {
		if (motivo.startsWith("Self-intersection") || motivo.startsWith("Ring Self-intersection")) {
			return "O contorno do lote se cruza. Refaça o desenho sem que as linhas passem umas sobre as outras.";
		}
		if (motivo.startsWith("Too few points")) {
			return "O lote precisa de pelo menos 3 pontos distintos";
		}
		return "O desenho do lote é inválido. Refaça o contorno.";
	}
}
