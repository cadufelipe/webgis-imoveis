package br.com.webgis.proprietario;

/** Ja existe outro proprietario com o nome pretendido. */
public class NomeDeProprietarioEmUsoException extends RuntimeException {

	public NomeDeProprietarioEmUsoException(String nome) {
		super("Já existe um proprietário com o nome \"" + nome + "\"");
	}
}
