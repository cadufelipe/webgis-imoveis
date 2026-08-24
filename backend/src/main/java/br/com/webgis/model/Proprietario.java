package br.com.webgis.model;

import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.service.ResolverProprietario;
import br.com.webgis.validation.Cpf;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

/**
 * Dono de um ou mais imoveis.
 *
 * O nome mora aqui, em uma linha so. E por isso que renomear um proprietario
 * vale automaticamente para todos os imoveis dele: nao existe copia do nome
 * espalhada pela tabela de imoveis.
 */
@Entity
@Table(name = "proprietario")
@Getter
public class Proprietario {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 120, unique = true)
	private String nome;

	/**
	 * So digitos, ou nulo para quem foi cadastrado antes da V9.
	 *
	 * Quando existe, e' ele quem identifica a pessoa — o nome vira apenas como
	 * ela e' chamada. Ver ResolverProprietario.
	 */
	@Column(length = 11, unique = true)
	private String cpf;

	@CreationTimestamp
	@Column(name = "criado_em", nullable = false, updatable = false)
	private OffsetDateTime criadoEm;

	@UpdateTimestamp
	@Column(name = "atualizado_em", nullable = false)
	private OffsetDateTime atualizadoEm;

	/** Exigido pelo JPA. Nao usar no codigo da aplicacao. */
	protected Proprietario() {
	}

	public Proprietario(String nome) {
		definirNome(nome);
	}

	public Proprietario(String nome, String cpf) {
		definirNome(nome);
		definirCpf(cpf);
	}

	/**
	 * Atribui o CPF a quem foi cadastrado sem ele.
	 *
	 * Nao troca um CPF por outro: documento nao se corrige assim. Se o que esta
	 * gravado estiver errado, o caminho e' cadastrar a pessoa certa — trocar
	 * aqui reatribuiria em silencio todos os imoveis deste proprietario a outra
	 * pessoa.
	 */
	public void identificarPor(String cpf) {
		if (this.cpf != null) {
			throw new DominioInvalidoException("Este proprietário já tem CPF cadastrado");
		}
		definirCpf(cpf);
	}

	private void definirCpf(String cpf) {
		if (cpf == null || cpf.isBlank()) {
			this.cpf = null;
			return;
		}
		if (!Cpf.valido(cpf)) {
			throw new DominioInvalidoException("CPF inválido");
		}
		this.cpf = Cpf.normalizar(cpf);
	}

	/**
	 * Corrige o nome. Como o nome nao e duplicado em nenhum outro lugar,
	 * a mudanca reflete em todos os imoveis do proprietario sem nenhum
	 * trabalho adicional.
	 */
	public void renomear(String novoNome) {
		definirNome(novoNome);
	}

	private void definirNome(String nome) {
		if (nome == null || nome.isBlank()) {
			throw new DominioInvalidoException("Nome do proprietário é obrigatório");
		}
		if (nome.trim().length() > 120) {
			throw new DominioInvalidoException("Nome do proprietário deve ter no máximo 120 caracteres");
		}
		this.nome = nome.trim();
	}
}
