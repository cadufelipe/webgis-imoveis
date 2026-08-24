package br.com.webgis.service;

import br.com.webgis.dto.ProprietarioRequest;
import br.com.webgis.dto.ProprietarioResponse;
import br.com.webgis.exception.ProprietarioNaoEncontradoException;
import br.com.webgis.model.Proprietario;
import br.com.webgis.repository.ProprietarioRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nao ha propagacao a fazer: o nome existe em uma unica linha e os imoveis
 * apontam para ela por chave estrangeira, entao a mudanca vale para todos eles
 * como consequencia do modelo, nao de codigo.
 *
 * Nao ha mais checagem de nome repetido: desde a V10 o nome nao e' unico, e
 * recusar a renomeacao porque outra pessoa se chama igual seria afirmar de novo
 * que nome identifica. Quem identifica e' o CPF, e ele nao muda por aqui.
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

		proprietario.renomear(req.nome().trim());

		// Garante que o UPDATE saia antes da consulta de contagem abaixo,
		// para a resposta refletir o nome novo.
		repository.flush();

		return repository.buscarComContagem(id)
				.orElseThrow(() -> new ProprietarioNaoEncontradoException(id));
	}
}
