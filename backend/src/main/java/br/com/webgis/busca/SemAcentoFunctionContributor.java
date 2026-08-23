package br.com.webgis.busca;

import org.hibernate.boot.model.FunctionContributions;
import org.hibernate.boot.model.FunctionContributor;
import org.hibernate.type.StandardBasicTypes;

/**
 * Registra a funcao sem_acento() (criada na migration V3) no dialeto do Hibernate.
 *
 * Sem este registro, o Hibernate 6 rejeita a funcao ao validar HQL na subida:
 * "Query validation failed". A Criteria API nao passa por essa validacao — ela
 * renderiza o nome direto — o que explica o ImovelSpecs funcionar sem isto e as
 * consultas @Query do ProprietarioRepository nao.
 *
 * Declarado em META-INF/services/org.hibernate.boot.model.FunctionContributor.
 */
public class SemAcentoFunctionContributor implements FunctionContributor {

	@Override
	public void contributeFunctions(FunctionContributions contribuicoes) {
		contribuicoes.getFunctionRegistry().registerPattern(
				"sem_acento",
				"sem_acento(?1)",
				contribuicoes.getTypeConfiguration()
						.getBasicTypeRegistry()
						.resolve(StandardBasicTypes.STRING));
	}
}
