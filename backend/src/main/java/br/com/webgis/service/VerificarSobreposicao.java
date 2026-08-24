package br.com.webgis.service;

import br.com.webgis.dto.ImovelRequest;
import br.com.webgis.exception.AreaSobrepostaException;
import br.com.webgis.repository.ImovelRepository;
import br.com.webgis.util.GeoJsonDoLote;

import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Recusa o cadastro quando o lote invade a area de outro imovel.
 *
 * Classe propria, e nao um metodo privado em CriarImovel e outro igual em
 * AtualizarImovel: e' a mesma regra nos dois caminhos.
 *
 * Sem @Transactional: e' sempre chamada de dentro da transacao do caso de uso,
 * e abrir uma propria separaria a leitura da escrita que ela protege.
 *
 * Esta e' a checagem **exata**, sobre a geometria em dupla precisao, e e' ela
 * que produz a mensagem que o usuario le. A constraint de exclusao no banco
 * cobre outra coisa — a corrida entre duas requisicoes simultaneas, que nenhum
 * SELECT resolve. Nao sao defesas redundantes.
 */
@Service
public class VerificarSobreposicao {

	private final ImovelRepository repository;

	public VerificarSobreposicao(ImovelRepository repository) {
		this.repository = repository;
	}

	/**
	 * @param idIgnorado o proprio imovel, na edicao. Nulo no cadastro.
	 */
	public void garantirAreaLivre(ImovelRequest req, Long idIgnorado) {
		// O lote desenhado tem precedencia aqui pelo mesmo motivo que tem na
		// gravacao: e' ele que vai para o banco, e validar o retangulo das
		// dimensoes recusaria — ou deixaria passar — uma area que nao e' a que
		// sera gravada.
		if (req.temPoligono()) {
			recusarSeOcupada(
					repository.primeiroImovelSobrepostoAoPoligono(
							GeoJsonDoLote.de(req.poligono()), idIgnorado));
			return;
		}

		// Sem dimensoes nao ha poligono, e sem poligono nao ha o que sobrepor:
		// e' o caso dos imoveis do seed, que seguem validos.
		if (req.largura() == null || req.comprimento() == null) {
			return;
		}

		recusarSeOcupada(repository.primeiroImovelSobreposto(
				req.latitude(), req.longitude(),
				req.largura(), req.comprimento(), idIgnorado));
	}

	private void recusarSeOcupada(Optional<Long> idDoConflitante) {
		idDoConflitante.ifPresent(id -> {
			throw new AreaSobrepostaException(id);
		});
	}
}
