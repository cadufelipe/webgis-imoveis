package br.com.webgis.service;

import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.exception.NomeDeProprietarioEmUsoException;
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
 * **E' o CPF quem identifica a pessoa.** O nome digitado nao entra na decisao:
 * CPF ja cadastrado reaproveita aquele proprietario, mesmo que o nome tenha
 * vindo escrito diferente. Deixar o nome vencer permitiria que um erro de
 * digitacao criasse um segundo cadastro para a mesma pessoa — exatamente o que
 * o documento existe para evitar. Corrigir a grafia continua sendo trabalho do
 * RenomearProprietario, que altera o nome para todos os imoveis de uma vez.
 *
 * O CPF e' **obrigatorio** para cadastrar ou editar imovel. A coluna continua
 * aceitando nulo por causa dos proprietarios anteriores a V9, que ninguem pode
 * documentar retroativamente — mas eles deixam de receber imoveis novos sem que
 * alguem informe o documento, e e' assim que o cadastro antigo se completa.
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
				.orElseGet(() -> vincularOuCriar(nome.trim(), documento));
	}

	/**
	 * CPF ainda nao cadastrado. Antes de criar um registro novo, procura pelo
	 * nome: quem ja esta no cadastro **sem** documento — os que vieram da carga
	 * inicial — recebe este CPF em vez de virar uma segunda linha para a mesma
	 * pessoa.
	 *
	 * Quando o nome ja existe com outro CPF, sao duas pessoas homonimas, e o
	 * cadastro nao suporta isso hoje: a coluna `nome` e' UNIQUE. O erro sai como
	 * conflito explicado, e nao como violacao de constraint.
	 */
	private Proprietario vincularOuCriar(String nome, String cpf) {
		Proprietario existente = repository.findByNomeIgnoreCase(nome).orElse(null);

		if (existente == null) {
			return inserirEBuscar(nome, cpf);
		}

		if (existente.getCpf() != null) {
			throw new NomeDeProprietarioEmUsoException(nome);
		}

		existente.identificarPor(cpf);
		return existente;
	}

	/**
	 * Entre a consulta acima e o insert existe uma janela: dois cadastros
	 * simultaneos com o mesmo nome novo passam ambos pelo findBy e ambos tentam
	 * inserir. Como a coluna e UNIQUE, um save() comum faria o perdedor da
	 * corrida receber 500 sem ter feito nada errado.
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

		return repository.findByNomeIgnoreCase(novo.getNome())
				.orElseThrow(() -> new IllegalStateException(
						"Proprietário \"" + novo.getNome() + "\" não encontrado logo após ser inserido"));
	}
}
