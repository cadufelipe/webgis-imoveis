package br.com.webgis.proprietario.dto;

/**
 * Contrato de saida da API de proprietarios.
 *
 * O CPF vem so' com digitos, como esta gravado: formatar e' decisao de tela, e
 * duas grafias do mesmo documento na API dariam trabalho a quem consome.
 */
public record ProprietarioResponse(Long id, String nome, String cpf, long quantidadeDeImoveis) {
}
