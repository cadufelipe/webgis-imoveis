/**
 * Contratos compartilhados por mais de uma feature.
 *
 * Existe para que {@code proprietario} nao precise importar de {@code imovel}
 * so para reaproveitar o envelope de paginacao: em package-by-feature, uma
 * feature dependendo de outra por um tipo generico e acoplamento acidental.
 *
 * Regra para crescer daqui: entra o que nao pertence a nenhuma feature. Um tipo
 * que so e "comum" porque duas features ainda nao divergiram fica na de origem.
 */
package br.com.webgis.comum;
