package br.com.webgis.proprietario;

/**
 * Regras do CPF, em um lugar so.
 *
 * Nao e' entidade nem coluna: o CPF mora como texto em Proprietario. Esta classe
 * existe porque a mesma pergunta — "estes 11 digitos formam um CPF?" — e' feita
 * na borda (pela anotacao @CpfValido) e no dominio (pelo construtor de
 * Proprietario), e uma regra escrita duas vezes e' uma regra que um dia diverge.
 */
public final class Cpf {

	public static final int TAMANHO = 11;

	private Cpf() {
	}

	/** So os digitos: quem digita usa ponto e hifen, e o banco guarda sem. */
	public static String normalizar(String valor) {
		return valor == null ? null : valor.replaceAll("\\D", "");
	}

	/**
	 * Verifica os dois digitos verificadores, e nao apenas o tamanho.
	 *
	 * Sem isto, "12345678901" entraria no cadastro como documento legitimo e so
	 * seria descoberto quando alguem tentasse usa-lo em outro sistema. A conta e'
	 * a mesma para os dois digitos, com pesos que comecam em 10 e em 11.
	 *
	 * A recusa dos 11 digitos repetidos e' explicita porque eles **passam** no
	 * calculo: "111.111.111-11" tem digito verificador correto, e mesmo assim
	 * nao e' CPF de ninguem.
	 */
	public static boolean valido(String valor) {
		String digitos = normalizar(valor);

		if (digitos == null || digitos.length() != TAMANHO || todosIguais(digitos)) {
			return false;
		}

		return digitoConfere(digitos, 9, 10) && digitoConfere(digitos, 10, 11);
	}

	private static boolean digitoConfere(String digitos, int posicao, int pesoInicial) {
		int soma = 0;

		for (int i = 0; i < posicao; i++) {
			soma += (digitos.charAt(i) - '0') * (pesoInicial - i);
		}

		int resto = soma % TAMANHO;
		int esperado = resto < 2 ? 0 : TAMANHO - resto;

		return digitos.charAt(posicao) - '0' == esperado;
	}

	private static boolean todosIguais(String digitos) {
		return digitos.chars().distinct().count() == 1;
	}
}
