package br.com.webgis.service;

import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.model.Proprietario;
import br.com.webgis.repository.ProprietarioRepository;
import br.com.webgis.validation.Cpf;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resolve o proprietario de um imovel a partir do que a API recebeu.
 *
 * O contrato recebe nome e CPF, e nao um id, para nao obrigar o cliente a
 * consultar proprietarios antes de cadastrar um imovel.
 *
 * **E' o CPF quem identifica a pessoa, e so ele.** O nome digitado nao entra na
 * decisao: CPF ja cadastrado reaproveita aquele proprietario, mesmo que o nome
 * tenha vindo escrito diferente; CPF novo cria um registro novo, mesmo que o
 * nome ja exista. Sao dois desfechos, e nao ha um terceiro.
 *
 * Ate a V10 havia. O nome era UNIQUE, entao um CPF novo com nome ja existente
 * nao tinha onde virar registro, e este servico tentava adivinhar entre duas
 * situacoes que chegam identicas na requisicao — "mesma pessoa, faltava o
 * documento" e "outra pessoa, mesmo nome". Adivinhava fundindo as duas, e com
 * elas os imoveis de ambas.
 *
 * Completar um cadastro anterior a V9 continua possivel, mas deixou de ser
 * inferencia: virou ato explicito, no IdentificarProprietario, partindo do
 * registro que o usuario tem na mao em vez de uma igualdade de string.
 */
@Service
public class ResolverProprietario {

	private final ProprietarioRepository repository;

	public ResolverProprietario(ProprietarioRepository repository) {
		this.repository = repository;
	}

	/**
	 * @param cpf com ou sem pontuacao.
	 */
	@Transactional
	public Proprietario resolver(String nome, String cpf) {
		String documento = Cpf.normalizar(cpf);

		// A borda ja exige o CPF (@NotBlank em ImovelRequest). Esta guarda cobre
		// qualquer outro caminho que venha a chamar este servico: sem documento
		// nao ha como decidir se o proprietario e' novo ou ja existe.
		if (documento == null || documento.isBlank()) {
			throw new DominioInvalidoException("CPF do proprietário é obrigatório");
		}

		return repository.findByCpf(documento)
				.orElseGet(() -> inserirEBuscar(nome.trim(), documento));
	}

	/**
	 * Entre a consulta acima e o insert existe uma janela: dois cadastros
	 * simultaneos com o mesmo CPF novo passam ambos pelo findByCpf e ambos
	 * tentam inserir. Como a coluna e UNIQUE, um save() comum faria o perdedor
	 * da corrida receber 500 sem ter feito nada errado.
	 *
	 * O inserirSeAusente empurra a decisao para o banco, que e quem tem a
	 * constraint, e sem levantar excecao. A releitura abaixo devolve o registro
	 * vencedor para os dois.
	 *
	 * Na mesma transacao de proposito: isolar o insert em REQUIRES_NEW tambem
	 * resolveria a corrida, mas faria cada requisicao segurar duas conexoes —
	 * com o pool padrao de 10, vinte cadastros simultaneos travam o pool.
	 */
	private Proprietario inserirEBuscar(String nome, String cpf) {
		// Passa pelo construtor primeiro: as invariantes valem mesmo com o
		// insert saindo por fora do Hibernate, e getNome() ja vem normalizado.
		Proprietario novo = new Proprietario(nome, cpf);

		repository.inserirSeAusente(novo.getNome(), novo.getCpf());

		// Pelo CPF, e nao pelo nome: e o CPF que acabou de ser gravado (ou que a
		// outra transacao gravou antes), e agora ele pode nao ser mais o unico
		// registro com este nome.
		return repository.findByCpf(novo.getCpf())
				.orElseThrow(() -> new IllegalStateException(
						"Proprietário com CPF " + novo.getCpf() + " não encontrado logo após ser inserido"));
	}
}
