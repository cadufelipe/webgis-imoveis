package br.com.webgis.imovel;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExcluirImovel {

	private final ImovelRepository repository;

	public ExcluirImovel(ImovelRepository repository) {
		this.repository = repository;
	}

	@Transactional
	public void executar(Long id) {
		if (!repository.existsById(id)) {
			throw new ImovelNaoEncontradoException(id);
		}
		repository.deleteById(id);
	}
}
