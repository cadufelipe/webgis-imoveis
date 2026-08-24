package br.com.webgis.service;

import br.com.webgis.dto.MunicipioResponse;
import br.com.webgis.dto.UfResponse;
import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.model.UnidadeFederativa;
import br.com.webgis.repository.ImovelRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Alimenta os selects de estado e cidade do filtro do mapa.
 *
 * Localidade nao e' cadastro proprio: e' uma leitura agrupada do endereco dos
 * imoveis. Nao ha entidade, repositorio nem tabela — por isso este servico
 * consulta o ImovelRepository, e nao um repositorio de localidade.
 */
@Service
@Transactional(readOnly = true)
public class ConsultarLocalidades {

	private final ImovelRepository repository;

	public ConsultarLocalidades(ImovelRepository repository) {
		this.repository = repository;
	}

	/**
	 * O nome por extenso vem do enum, e nao do banco: guardar a coluna seria
	 * repetir 200 mil vezes uma informacao de 27 valores que nunca muda.
	 */
	public List<UfResponse> ufs() {
		return repository.contarPorUf().stream()
				.map(contagem -> new UfResponse(
						contagem.valor(),
						UnidadeFederativa.porSigla(contagem.valor())
								.map(UnidadeFederativa::getNome)
								// Mostra a sigla em vez de quebrar a tela inteira
								// por causa de uma linha ruim.
								.orElse(contagem.valor()),
						contagem.quantidade()))
				.toList();
	}

	/**
	 * Municipios de uma UF. Sigla inexistente e' `400`, e nao lista vazia: lista
	 * vazia diria "esta UF nao tem imoveis", que e' outra coisa — e esconderia
	 * um erro de quem chamou.
	 */
	public List<MunicipioResponse> municipiosDa(String sigla) {
		UnidadeFederativa unidade = UnidadeFederativa.porSigla(sigla)
				.orElseThrow(() -> new DominioInvalidoException(
						"UF deve ser uma das 27 unidades federativas do Brasil"));

		return repository.contarMunicipiosDa(unidade.getSigla()).stream()
				.map(contagem -> new MunicipioResponse(contagem.valor(), contagem.quantidade()))
				.toList();
	}
}
