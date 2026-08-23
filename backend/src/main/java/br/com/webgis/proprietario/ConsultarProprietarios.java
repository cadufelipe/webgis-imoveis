package br.com.webgis.proprietario;

import br.com.webgis.busca.TermoDeBusca;
import br.com.webgis.comum.DominioInvalidoException;
import br.com.webgis.comum.PaginaResponse;
import br.com.webgis.proprietario.dto.ProprietarioResponse;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ConsultarProprietarios {

	private final ProprietarioRepository repository;

	public ConsultarProprietarios(ProprietarioRepository repository) {
		this.repository = repository;
	}

	public PaginaResponse<ProprietarioResponse> listar(String nome, Pageable paginacao) {
		// A consulta ja devolve o DTO montado; nao ha conversao no meio.
		return PaginaResponse.de(repository.listarComContagem(TermoDeBusca.contendo(nome), paginacao));
	}

	/**
	 * Quem ja esta cadastrado com este CPF.
	 *
	 * Normaliza antes de consultar porque quem chama e' a tela, e la o documento
	 * chega como foi digitado — com ponto e hifen. A coluna guarda so digitos.
	 */
	public ProprietarioResponse buscarPorCpf(String cpf) {
		String documento = Cpf.normalizar(cpf);

		if (documento == null || !Cpf.valido(documento)) {
			throw new DominioInvalidoException("CPF inválido");
		}

		return repository.buscarComContagemPorCpf(documento)
				.orElseThrow(() -> ProprietarioNaoEncontradoException.porCpf(documento));
	}

	public ProprietarioResponse buscarPorId(Long id) {
		return repository.buscarComContagem(id)
				.orElseThrow(() -> new ProprietarioNaoEncontradoException(id));
	}
}
