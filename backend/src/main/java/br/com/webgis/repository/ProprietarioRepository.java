package br.com.webgis.repository;

import br.com.webgis.dto.ProprietarioResponse;
import br.com.webgis.model.Imovel;
import br.com.webgis.model.Proprietario;
import br.com.webgis.service.ResolverProprietario;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ProprietarioRepository extends JpaRepository<Proprietario, Long> {

	Optional<Proprietario> findByNomeIgnoreCase(String nome);

	/** Recebe o CPF ja normalizado — a coluna guarda so digitos. */
	Optional<Proprietario> findByCpf(String cpf);

	/**
	 * Insere o proprietario, ou nao faz nada se outra transacao ja tiver
	 * inserido o mesmo nome.
	 *
	 * Fecha a janela entre o findByNomeIgnoreCase e o insert do
	 * ResolverProprietario. O ON CONFLICT resolve a corrida sem levantar
	 * excecao, entao a transacao do caso de uso nunca e marcada como
	 * rollback-only.
	 *
	 * Native query porque ON CONFLICT nao existe em JPQL; o :nome e parametro
	 * vinculado, nao concatenacao.
	 *
	 * now() no lugar do @CreationTimestamp: o insert nao passa pelo Hibernate,
	 * entao as colunas de auditoria sao preenchidas aqui.
	 */
	@Modifying
	@Query(value = """
			insert into proprietario (nome, cpf, criado_em, atualizado_em)
			values (:nome, CAST(:cpf AS varchar), now(), now())
			on conflict on constraint uk_proprietario_nome do nothing
			""", nativeQuery = true)
	void inserirSeAusente(@Param("nome") String nome, @Param("cpf") String cpf);

	boolean existsByNomeIgnoreCaseAndIdNot(String nome, Long id);

	/**
	 * Listagem com a contagem de imoveis de cada um, em uma consulta so —
	 * em vez de listar os proprietarios e contar imoveis por linha (N+1).
	 *
	 * O parametro chega sempre preenchido (curinga puro quando nao ha filtro),
	 * o que dispensa o ":nome is null or ..." e a inferencia de tipo que ele exige.
	 *
	 * A countQuery e explicita porque o GROUP BY impede o Spring Data de derivar
	 * uma contagem correta sozinho: ele contaria os grupos errados.
	 */
	@Query(value = """
			select new br.com.webgis.dto.ProprietarioResponse(
			    p.id, p.nome, p.cpf, count(i.id))
			from Proprietario p
			left join Imovel i on i.proprietario = p
			where sem_acento(p.nome) like :nome
			group by p.id, p.nome, p.cpf
			""",
			countQuery = """
			select count(p)
			from Proprietario p
			where sem_acento(p.nome) like :nome
			""")
	Page<ProprietarioResponse> listarComContagem(@Param("nome") String nome, Pageable paginacao);

	@Query("""
			select new br.com.webgis.dto.ProprietarioResponse(
			    p.id, p.nome, p.cpf, count(i.id))
			from Proprietario p
			left join Imovel i on i.proprietario = p
			where p.id = :id
			group by p.id, p.nome, p.cpf
			""")
	Optional<ProprietarioResponse> buscarComContagem(@Param("id") Long id);

	/**
	 * Quem tem este CPF, se alguem tiver. Alimenta a identificacao do
	 * proprietario no formulario de imovel, entao devolve a mesma forma das
	 * outras consultas — inclusive a contagem, que a tela mostra para quem
	 * digitou o documento saber que achou a pessoa certa.
	 */
	@Query("""
			select new br.com.webgis.dto.ProprietarioResponse(
			    p.id, p.nome, p.cpf, count(i.id))
			from Proprietario p
			left join Imovel i on i.proprietario = p
			where p.cpf = :cpf
			group by p.id, p.nome, p.cpf
			""")
	Optional<ProprietarioResponse> buscarComContagemPorCpf(@Param("cpf") String cpf);
}
