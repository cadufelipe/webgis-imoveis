package br.com.webgis.dto;

import br.com.webgis.model.UnidadeFederativa;

/**
 * Uma UF que tem imoveis cadastrados.
 *
 * `nome` vem do enum UnidadeFederativa, e nao do banco, que guarda so a sigla.
 * `quantidadeDeImoveis` sai do mesmo GROUP BY que monta a lista, entao nao
 * custa consulta a mais e diz de antemao quanto o filtro vai devolver.
 */
public record UfResponse(String sigla, String nome, long quantidadeDeImoveis) {
}
