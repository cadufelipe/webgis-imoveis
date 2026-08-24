package br.com.webgis.model;

import br.com.webgis.exception.DominioInvalidoException;
import br.com.webgis.repository.ImovelSpecs;
import br.com.webgis.service.GravarGeometriaDoLote;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Formula;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "imovel")
@Getter
public class Imovel {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/**
	 * LAZY de proposito: a listagem faz fetch join explicito (ver ImovelSpecs),
	 * o que evita N+1 sem obrigar toda leitura a carregar o proprietario.
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "proprietario_id", nullable = false)
	private Proprietario proprietario;

	@Embedded
	private Endereco endereco;

	@Embedded
	private Coordenada coordenada;

	@Column(name = "area_m2", precision = 12, scale = 2)
	private BigDecimal areaM2;

	/** Nulas quando o imovel foi cadastrado sem elas — o caso dos 12 do seed. */
	@Embedded
	private Dimensoes dimensoes;

	/**
	 * O poligono do lote em GeoJSON, ja reprojetado para WGS 84, que e o que o
	 * Leaflet desenha.
	 *
	 * @Formula, e nao @Column: desde a V7 a coluna `geom` e' gravada, mas quem a
	 * grava e' o GravarGeometriaDoLote, em SQL nativo. Mapea-la como campo
	 * comum exigiria o hibernate-spatial e o JTS para transportar uma geometria
	 * que o Java nunca inspeciona — aqui o proprio Postgres converte na leitura
	 * e o que chega e' texto.
	 *
	 * **So e' preenchido em leitura.** @Formula nao participa de INSERT nem de
	 * UPDATE, entao logo apos uma escrita este campo ainda e' o valor antigo na
	 * entidade em memoria. E' por isso que o GravarGeometriaDoLote termina com
	 * um refresh: sem ele, a resposta do POST viria sem o lote que acabou de ser
	 * desenhado.
	 */
	@Formula("ST_AsGeoJSON(ST_Transform(geom, 4326))")
	private String poligono;

	private boolean ativo = true;

	@CreationTimestamp
	@Column(name = "criado_em", nullable = false, updatable = false)
	private OffsetDateTime criadoEm;

	@UpdateTimestamp
	@Column(name = "atualizado_em", nullable = false)
	private OffsetDateTime atualizadoEm;

	/** Exigido pelo JPA. Nao usar no codigo da aplicacao. */
	protected Imovel() {
	}

	public Imovel(Proprietario proprietario, Endereco endereco, Coordenada coordenada,
				  BigDecimal areaM2, Dimensoes dimensoes) {
		definirProprietario(proprietario);
		definirLocalizacao(endereco, coordenada);
		definirArea(areaM2);
		definirDimensoes(dimensoes);
	}

	/** Substitui os dados cadastrais. Situacao (ativo/inativo) nao se altera por aqui. */
	public void atualizarDados(Proprietario proprietario, Endereco endereco, Coordenada coordenada,
							   BigDecimal areaM2, Dimensoes dimensoes) {
		definirProprietario(proprietario);
		definirLocalizacao(endereco, coordenada);
		definirArea(areaM2);
		definirDimensoes(dimensoes);
	}

	public void ativar() {
		this.ativo = true;
	}

	public void desativar() {
		this.ativo = false;
	}

	private void definirProprietario(Proprietario proprietario) {
		if (proprietario == null) {
			throw new DominioInvalidoException("Proprietário é obrigatório");
		}
		this.proprietario = proprietario;
	}

	private void definirLocalizacao(Endereco endereco, Coordenada coordenada) {
		if (endereco == null) {
			throw new DominioInvalidoException("Endereco e obrigatorio");
		}
		if (coordenada == null) {
			throw new DominioInvalidoException("Coordenada e obrigatoria");
		}
		this.endereco = endereco;
		this.coordenada = coordenada;
	}

	private void definirArea(BigDecimal areaM2) {
		if (areaM2 != null && areaM2.signum() <= 0) {
			throw new DominioInvalidoException("Area deve ser maior que zero");
		}
		this.areaM2 = areaM2;
	}

	/**
	 * Dimensoes mandam na area: com o par informado, o valor digitado no campo
	 * de area e descartado. Dois numeros descrevendo o mesmo lote acabariam
	 * divergindo, e quem o usuario acredita e o poligono desenhado no mapa.
	 *
	 * Chamado depois de definirArea de proposito: esta e a regra que vence.
	 */
	private void definirDimensoes(Dimensoes dimensoes) {
		this.dimensoes = dimensoes;

		if (dimensoes != null) {
			this.areaM2 = dimensoes.area();
		}
	}
}
