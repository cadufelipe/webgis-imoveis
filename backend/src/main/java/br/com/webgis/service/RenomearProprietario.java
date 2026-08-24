package br.com.webgis.service;

import br.com.webgis.dto.ProprietarioRequest;
import br.com.webgis.dto.ProprietarioResponse;
import br.com.webgis.exception.NomeDeProprietarioEmUsoException;
import br.com.webgis.exception.ProprietarioNaoEncontradoException;
import br.com.webgis.model.Proprietario;
import br.com.webgis.repository.ProprietarioRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nao ha propagacao a fazer: o nome existe em uma unica linha e os imoveis
 * apontam para ela por chave estrangeira, entao a mudanca vale para todos eles
 * como consequencia do modelo, nao de codigo.
 */
@Service
public class RenomearProprietario {

	private final ProprietarioRepository repository;

	public RenomearProprietario(ProprietarioRepository repository) {
		this.repository = repository;
	}

	@Transactional
	public ProprietarioResponse executar(Long id, ProprietarioRequest req) {
		Proprietario proprietario = repository.findById(id)
				.orElseThrow(() -> new ProprietarioNaoEncontradoException(id));

		String nomePretendido = req.nome().trim();

		// A coluna e UNIQUE; checar antes troca uma violacao de constraint
		// (que viraria 500) por um erro de negocio com mensagem util e 409.
		if (repository.existsByNomeIgnoreCaseAndIdNot(nomePretendido, id)) {
			throw new NomeDeProprietarioEmUsoException(nomePretendido);
		}

		proprietario.renomear(nomePretendido);

		// Garante que o UPDATE saia antes da consulta de contagem abaixo,
		// para a resposta refletir o nome novo.
		repository.flush();

		return repository.buscarComContagem(id)
				.orElseThrow(() -> new ProprietarioNaoEncontradoException(id));
	}
}
