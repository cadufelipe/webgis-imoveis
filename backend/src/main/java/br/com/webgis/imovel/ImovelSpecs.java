package br.com.webgis.imovel;

import br.com.webgis.imovel.dto.ImovelFiltro;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

/**
 * Monta a clausula WHERE da listagem a partir dos filtros informados.
 *
 * Cada filtro ausente simplesmente nao vira predicado — o SQL gerado nao carrega
 * condicao inutil, ao contrario de um LIKE de curinga puro aplicado sempre.
 */
final class ImovelSpecs {

	private ImovelSpecs() {
	}

	static Specification<Imovel> comFiltro(ImovelFiltro filtro) {
		return (raiz, consulta, construtor) -> {

			// Traz o proprietario na mesma consulta. Sem isto, montar a resposta
			// de 20 imoveis dispararia 20 selects adicionais (N+1).
			// O guard evita aplicar o fetch na consulta de contagem, onde ele
			// seria invalido.
			if (consulta != null && Long.class != consulta.getResultType()) {
				raiz.fetch("proprietario", JoinType.INNER);
			}

			List<Predicate> predicados = new ArrayList<>();

			if (filtro.temProprietario()) {
				predicados.add(construtor.like(
						construtor.function("sem_acento", String.class, raiz.get("proprietario").get("nome")),
						filtro.proprietarioParaBusca()));
			}

			if (filtro.temProprietarioId()) {
				predicados.add(construtor.equal(raiz.get("proprietario").get("id"), filtro.proprietarioId()));
			}

			if (filtro.temUf()) {
				// Igualdade, e nao LIKE: sigla e' valor fechado, vindo de um
				// select. Comparar por igualdade permite indice comum e evita
				// que "SP" tambem casasse com uma UF hipotetica que a contivesse.
				predicados.add(construtor.equal(raiz.get("endereco").get("uf"), filtro.uf()));
			}

			if (filtro.temMunicipio()) {
				// municipio mora dentro do value object Endereco (@Embedded),
				// entao o caminho passa por ele.
				predicados.add(construtor.like(
						construtor.function("sem_acento", String.class, raiz.get("endereco").get("municipio")),
						filtro.municipioParaBusca()));
			}

			return predicados.isEmpty() ? null : construtor.and(predicados.toArray(Predicate[]::new));
		};
	}
}
