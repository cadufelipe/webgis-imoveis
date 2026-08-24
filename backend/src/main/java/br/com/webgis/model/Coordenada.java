package br.com.webgis.model;

import br.com.webgis.exception.DominioInvalidoException;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;

import java.math.BigDecimal;

/**
 * Par latitude/longitude. Imutavel: uma coordenada nao "muda", ela e substituida.
 */
@Embeddable
@Getter
public class Coordenada {

	private static final BigDecimal LATITUDE_MINIMA = new BigDecimal("-90");
	private static final BigDecimal LATITUDE_MAXIMA = new BigDecimal("90");
	private static final BigDecimal LONGITUDE_MINIMA = new BigDecimal("-180");
	private static final BigDecimal LONGITUDE_MAXIMA = new BigDecimal("180");

	@Column(nullable = false, precision = 10, scale = 7)
	private BigDecimal latitude;

	@Column(nullable = false, precision = 10, scale = 7)
	private BigDecimal longitude;

	/** Exigido pelo JPA. Nao usar no codigo da aplicacao. */
	protected Coordenada() {
	}

	public Coordenada(BigDecimal latitude, BigDecimal longitude) {
		if (latitude == null || longitude == null) {
			throw new DominioInvalidoException("Latitude e longitude sao obrigatorias");
		}
		if (latitude.compareTo(LATITUDE_MINIMA) < 0 || latitude.compareTo(LATITUDE_MAXIMA) > 0) {
			throw new DominioInvalidoException("Latitude deve estar entre -90 e 90");
		}
		if (longitude.compareTo(LONGITUDE_MINIMA) < 0 || longitude.compareTo(LONGITUDE_MAXIMA) > 0) {
			throw new DominioInvalidoException("Longitude deve estar entre -180 e 180");
		}
		this.latitude = latitude;
		this.longitude = longitude;
	}
}
