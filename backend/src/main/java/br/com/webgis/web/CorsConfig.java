package br.com.webgis.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Politica de CORS da aplicacao inteira.
 * As origens vem de propriedade, entao cada ambiente define a sua sem recompilar.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

	private final String[] origensPermitidas;

	public CorsConfig(@Value("${webgis.cors.origens-permitidas}") String[] origensPermitidas) {
		this.origensPermitidas = origensPermitidas;
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
				.allowedOrigins(origensPermitidas)
				.allowedMethods("GET", "POST", "PUT", "DELETE")
				.allowedHeaders("*")
				.maxAge(3600);
	}
}
