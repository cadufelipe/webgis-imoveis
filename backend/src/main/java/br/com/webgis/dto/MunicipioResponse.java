package br.com.webgis.dto;

/**
 * Um municipio que tem imoveis cadastrados, dentro de uma UF.
 *
 * Nao ha `uf` aqui: o municipio so e' pedido dentro do caminho de uma UF
 * (`/api/localidades/ufs/{uf}/municipios`), entao repetir a sigla em cada item
 * seria devolver a mesma informacao N vezes.
 */
public record MunicipioResponse(String nome, long quantidadeDeImoveis) {
}
