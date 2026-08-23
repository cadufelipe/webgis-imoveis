package br.com.webgis.comum;

/**
 * Invariante de dominio violada.
 *
 * Tipo proprio para tirar a IllegalArgumentException do caminho: aquela chega
 * de qualquer lugar da pilha, e mapea-la para 400 transformava defeito de
 * programacao em "dados invalidos" — o usuario levava a culpa e o erro sumia do
 * radar, sem log nem codigo de correlacao. Aqui o 400 e' deliberado.
 */
public class DominioInvalidoException extends RuntimeException {

	public DominioInvalidoException(String mensagem) {
		super(mensagem);
	}
}
