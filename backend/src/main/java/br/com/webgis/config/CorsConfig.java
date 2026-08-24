package br.com.webgis.config;

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
		// PATCH entrou junto com o PATCH /api/proprietarios/{id}/cpf. Sem ele o
		// preflight e' recusado e o navegador nem chega a mandar a requisicao —
		// a tela ve status 0, indistinguivel de servidor fora do ar.
		registry.addMapping("/api/**")
				.allowedOrigins(origensPermitidas)
				.allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
				.allowedHeaders("*")
				.maxAge(3600);
	}
}
