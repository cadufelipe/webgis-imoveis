package br.com.webgis.exception;

/**
 * Sinaliza que o imovel solicitado nao existe.
 * Excecao de dominio: nao conhece HTTP. A traducao para 404 e feita
 * na camada web, pelo ManipuladorDeErros.
 */
public class ImovelNaoEncontradoException extends RuntimeException {

	private final Long id;

	public ImovelNaoEncontradoException(Long id) {
		super("Imóvel " + id + " não encontrado");
		this.id = id;
	}

	public Long getId() {
		return id;
	}
}
