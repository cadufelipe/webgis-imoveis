package br.com.webgis.exception;

/** O CPF informado ja pertence a outro proprietario. */
public class CpfDeProprietarioEmUsoException extends RuntimeException {

	private final Long idDoProprietarioComOCpf;

	public CpfDeProprietarioEmUsoException(String cpf, Long idDoProprietarioComOCpf) {
		super("O CPF " + cpf + " já pertence a outro proprietário");
		this.idDoProprietarioComOCpf = idDoProprietarioComOCpf;
	}

	/** A tela usa para oferecer o registro certo em vez de so recusar. */
	public Long getIdDoProprietarioComOCpf() {
		return idDoProprietarioComOCpf;
	}
}
