package br.com.webgis.repository;

import br.com.webgis.dto.ContagemDeLocalidade;
import br.com.webgis.model.Imovel;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * JpaSpecificationExecutor habilita findAll(Specification, Pageable), que e o
 * que permite combinar filtros opcionais com paginacao em uma consulta so.
 */
public interface ImovelRepository extends JpaRepository<Imovel, Long>, JpaSpecificationExecutor<Imovel> {

	/**
	 * UFs que **tem** imovel cadastrado, com a contagem de cada uma.
	 *
	 * Sai do banco, e nao das 27 constantes: o enum e' a fonte da **validacao**
	 * (o que se pode cadastrar), esta consulta e' a fonte do **filtro** (o que
	 * existe para procurar). Sao perguntas diferentes.
	 */
	@Query("""
			SELECT new br.com.webgis.dto.ContagemDeLocalidade(i.endereco.uf, COUNT(i))
			FROM Imovel i
			GROUP BY i.endereco.uf
			ORDER BY i.endereco.uf
			""")
	List<ContagemDeLocalidade> contarPorUf();

	/** Municipios com imovel cadastrado dentro de uma UF, em ordem alfabetica. */
	@Query("""
			SELECT new br.com.webgis.dto.ContagemDeLocalidade(i.endereco.municipio, COUNT(i))
			FROM Imovel i
			WHERE i.endereco.uf = :uf
			GROUP BY i.endereco.municipio
			ORDER BY i.endereco.municipio
			""")
	List<ContagemDeLocalidade> contarMunicipiosDa(@Param("uf") String uf);

	/**
	 * O primeiro imovel cujo lote se sobrepoe ao retangulo informado, se houver.
	 *
	 * **ST_Intersects menos ST_Touches**, e nao ST_Overlaps.
	 *
	 * ST_Intersects sozinho e' `true` para dois lotes que apenas dividem a
	 * divisa, e recusaria todo vizinho legitimo — o caso mais comum de um
	 * cadastro imobiliario. ST_Touches isola exatamente esse caso: contato so
	 * pela fronteira, area de interseccao zero.
	 *
	 * ST_Overlaps, que estava aqui antes, deixava passar o pior caso: ele exige
	 * que **nenhuma** das geometrias contenha a outra, entao um lote desenhado
	 * inteiramente dentro de outro era aceito. Quem recusava era a constraint de
	 * exclusao, no commit, com uma mensagem generica e sem o id do conflitante.
	 *
	 * Reusa a mesma funcao `lote_retangular` da coluna gerada, entao o poligono
	 * testado aqui e' identico ao que sera gravado.
	 *
	 * `idIgnorado` existe para a edicao: um imovel nao se sobrepoe a si mesmo.
	 * O COALESCE evita um segundo metodo so para o caso do cadastro.
	 *
	 * Os CAST sao explicitos porque, em query nativa, o driver manda o parametro
	 * como tipo desconhecido e o Postgres nao escolhe a sobrecarga sozinho.
	 *
	 * Nativa porque as funcoes do PostGIS nao existem em JPQL. Os valores vao
	 * vinculados, nao concatenados.
	 */
	@Query(value = """
			SELECT i.id
			FROM imovel i, (
			    SELECT lote_retangular(
			        CAST(:latitude AS numeric), CAST(:longitude AS numeric),
			        CAST(:largura AS numeric), CAST(:comprimento AS numeric)) AS lote
			) g
			WHERE i.geom IS NOT NULL
			  AND i.id <> COALESCE(CAST(:idIgnorado AS bigint), -1)
			  AND ST_Intersects(i.geom, g.lote)
			  AND NOT ST_Touches(i.geom, g.lote)
			LIMIT 1
			""", nativeQuery = true)
	Optional<Long> primeiroImovelSobreposto(@Param("latitude") BigDecimal latitude,
											@Param("longitude") BigDecimal longitude,
											@Param("largura") BigDecimal largura,
											@Param("comprimento") BigDecimal comprimento,
											@Param("idIgnorado") Long idIgnorado);

	/** O mesmo teste do metodo acima, para o lote que veio desenhado. */
	@Query(value = """
			SELECT i.id
			FROM imovel i, (
			    SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:geojson AS text)), 4326), 31982) AS lote
			) g
			WHERE i.geom IS NOT NULL
			  AND i.id <> COALESCE(CAST(:idIgnorado AS bigint), -1)
			  AND ST_Intersects(i.geom, g.lote)
			  AND NOT ST_Touches(i.geom, g.lote)
			LIMIT 1
			""", nativeQuery = true)
	Optional<Long> primeiroImovelSobrepostoAoPoligono(@Param("geojson") String geojson,
													  @Param("idIgnorado") Long idIgnorado);

	/**
	 * O motivo pelo qual o poligono e' invalido, ou vazio quando ele e' valido.
	 *
	 * Perguntar antes de gravar, e nao deixar a CHECK do banco recusar: a
	 * violacao de constraint chega como DataIntegrityViolationException, que
	 * viraria 500 ou uma mensagem que nao diz o que ha de errado. O
	 * ST_IsValidReason devolve "Self-intersection at ..." com a coordenada.
	 */
	@Query(value = """
			SELECT ST_IsValidReason(g.lote)
			FROM (
			    SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:geojson AS text)), 4326), 31982) AS lote
			) g
			WHERE NOT ST_IsValid(g.lote)
			""", nativeQuery = true)
	Optional<String> motivoDePoligonoInvalido(@Param("geojson") String geojson);

	/**
	 * Grava o lote desenhado e alinha a ele tudo o que dele deriva.
	 *
	 * Um comando so' porque as quatro colunas descrevem a mesma coisa: dois
	 * updates deixariam uma janela em que a area diz uma medida e o poligono
	 * outra.
	 *
	 * O ponto do imovel vai para dentro do lote por **ST_PointOnSurface, e nao
	 * ST_Centroid**: o centroide de um terreno em L cai fora do proprio terreno,
	 * e a CHECK ck_imovel_ponto_dentro_do_lote recusaria a gravacao.
	 *
	 * largura e comprimento sao zerados: o poligono venceu, e deixar as duas
	 * medidas antigas ali seria guardar um retangulo que nao existe mais.
	 *
	 * `atualizado_em` na mao porque o @UpdateTimestamp nao roda em update nativo.
	 */
	@Modifying(flushAutomatically = true)
	@Query(value = """
			UPDATE imovel
			SET geom          = g.lote,
			    latitude      = ROUND(ST_Y(g.ponto)::numeric, 7),
			    longitude     = ROUND(ST_X(g.ponto)::numeric, 7),
			    area_m2       = ROUND(ST_Area(g.lote)::numeric, 2),
			    largura       = NULL,
			    comprimento   = NULL,
			    atualizado_em = now()
			FROM (
			    SELECT l.lote, ST_Transform(ST_PointOnSurface(l.lote), 4326) AS ponto
			    FROM (
			        SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:geojson AS text)), 4326), 31982) AS lote
			    ) l
			) g
			WHERE imovel.id = CAST(:id AS bigint)
			""", nativeQuery = true)
	void gravarLoteDesenhado(@Param("id") Long id, @Param("geojson") String geojson);

	/**
	 * Remonta o retangulo a partir do centro e das dimensoes — o que a coluna
	 * gerada fazia sozinha ate a V7.
	 *
	 * Chamado tambem quando nao ha dimensao nenhuma, e ai o proprio
	 * `lote_retangular`, que e' STRICT, devolve nulo: e' assim que apagar as
	 * medidas de um imovel apaga a geometria dele, em vez de deixar para tras um
	 * lote que ninguem mais consegue editar.
	 */
	@Modifying(flushAutomatically = true)
	@Query(value = """
			UPDATE imovel
			SET geom          = lote_retangular(latitude, longitude, largura, comprimento),
			    atualizado_em = now()
			WHERE id = CAST(:id AS bigint)
			""", nativeQuery = true)
	void remontarLoteRetangular(@Param("id") Long id);
}
