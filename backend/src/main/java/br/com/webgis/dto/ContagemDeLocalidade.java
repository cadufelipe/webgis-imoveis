package br.com.webgis.dto;

/**
 * Resultado cru de um `GROUP BY` de localidade: o valor agrupado e quantos
 * imoveis caem nele.
 *
 * Nao e' contrato de API: serve aos dois agrupamentos, por UF e por municipio,
 * porque a forma e' a mesma. Quem da' nome aos campos na resposta e' o
 * UfResponse ou o MunicipioResponse.
 *
 * Existe para a projecao ser tipada — a alternativa seria `List<Object[]>`,
 * com indices magicos.
 */
public record ContagemDeLocalidade(String valor, long quantidade) {
}
