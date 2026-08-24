package br.com.webgis.exception;

/** Excecao de dominio: nao conhece HTTP. A traducao para 404 fica na camada web. */
public class ProprietarioNaoEncontradoException extends RuntimeException {

	private final Long id;

	public ProprietarioNaoEncontradoException(Long id) {
		super("Proprietário " + id + " não encontrado");
		this.id = id;
	}

	/** O id fica nulo quando a procura foi por documento: nao havia id para procurar. */
	public static ProprietarioNaoEncontradoException porCpf(String cpf) {
		return new ProprietarioNaoEncontradoException("Nenhum proprietário com o CPF " + cpf);
	}

	private ProprietarioNaoEncontradoException(String mensagem) {
		super(mensagem);
		this.id = null;
	}

	public Long getId() {
		return id;
	}
}
