package br.com.webgis.service;

import br.com.webgis.dto.CpfRequest;
import br.com.webgis.dto.ProprietarioResponse;
import br.com.webgis.exception.CpfDeProprietarioEmUsoException;
import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.exception.ProprietarioNaoEncontradoException;
import br.com.webgis.model.Proprietario;
import br.com.webgis.repository.ProprietarioRepository;
import br.com.webgis.validation.Cpf;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Da documento a um proprietario anterior a V9 — os da carga inicial, que
 * ninguem pode documentar retroativamente.
 *
 * E' o unico lugar onde um cadastro existente passa a ter CPF, e ele exige o
 * **id**: quem chama esta afirmando "e' esta pessoa", partindo do registro que
 * tem na mao. Ate a V10 isso era inferido do nome dentro do
 * ResolverProprietario, e a inferencia errava exatamente onde mais custa —
 * homonimo sem documento recebia o CPF de outra pessoa, e os imoveis das duas
 * ficavam sob o mesmo registro.
 *
 * Nao troca CPF por outro: quem ja tem documento e' recusado pelo proprio
 * dominio, no identificarPor.
 */
@Service
public class IdentificarProprietario {

	private final ProprietarioRepository repository;

	public IdentificarProprietario(ProprietarioRepository repository) {
		this.repository = repository;
	}

	@Transactional
	public ProprietarioResponse executar(Long id, CpfRequest req) {
		Proprietario proprietario = repository.findById(id)
				.orElseThrow(() -> new ProprietarioNaoEncontradoException(id));

		String documento = Cpf.normalizar(req.cpf());

		if (documento == null || !Cpf.valido(documento)) {
			throw new DominioInvalidoException("CPF inválido");
		}

		// A coluna e UNIQUE; checar antes troca uma violacao de constraint (que
		// viraria 500) por um erro de negocio com mensagem util e 409 — e permite
		// devolver de quem e o documento, que a constraint nao diz.
		repository.findByCpf(documento).ifPresent(dono -> {
			if (!dono.getId().equals(id)) {
				throw new CpfDeProprietarioEmUsoException(documento, dono.getId());
			}
		});

		proprietario.identificarPor(documento);

		// Garante que o UPDATE saia antes da consulta de contagem abaixo,
		// para a resposta refletir o documento novo.
		repository.flush();

		return repository.buscarComContagem(id)
				.orElseThrow(() -> new ProprietarioNaoEncontradoException(id));
	}
}
