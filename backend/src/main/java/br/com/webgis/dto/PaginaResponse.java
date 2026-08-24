package br.com.webgis.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Envelope de paginacao da API.
 *
 * Existe para nao serializar o Page do Spring diretamente: a estrutura JSON do
 * PageImpl e detalhe interno da biblioteca, muda entre versoes e o proprio
 * Spring Boot 3.3+ emite alerta contra expo-la. Aqui o contrato e nosso.
 */
public record PaginaResponse<T>(
		List<T> conteudo,
		int pagina,
		int tamanho,
		long totalDeItens,
		int totalDePaginas,
		boolean primeira,
		boolean ultima
) {

	/** Quando a consulta ja devolve o tipo final, sem conversao no meio. */
	public static <T> PaginaResponse<T> de(Page<T> pagina) {
		return de(pagina, Function.identity());
	}

	public static <E, T> PaginaResponse<T> de(Page<E> pagina, Function<E, T> conversor) {
		return new PaginaResponse<>(
				pagina.getContent().stream().map(conversor).toList(),
				pagina.getNumber(),
				pagina.getSize(),
				pagina.getTotalElements(),
				pagina.getTotalPages(),
				pagina.isFirst(),
				pagina.isLast());
	}
}
