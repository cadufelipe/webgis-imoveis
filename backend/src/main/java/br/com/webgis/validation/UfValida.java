package br.com.webgis.validation;

import br.com.webgis.exception.ManipuladorDeErros;
import br.com.webgis.model.UnidadeFederativa;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Restringe o campo a uma das 27 unidades federativas do Brasil.
 *
 * Poderia ser um `@Pattern` com as 27 siglas alternadas na expressao regular, e
 * seria uma linha a menos. Nao foi: a lista ficaria escrita duas vezes — aqui e
 * no enum — e nada garantiria que as duas continuassem iguais. Aqui a anotacao
 * pergunta ao enum, que e' a unica fonte.
 *
 * Anotacao propria tambem preserva o formato de erro que o frontend ja consome:
 * o ManipuladorDeErros devolve uma mensagem por campo, e "UF deve ser uma das 27
 * unidades federativas do Brasil" chega no campo `uf` do formulario.
 */
@Documented
@Constraint(validatedBy = UfValida.Validador.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface UfValida {

	String message() default "UF deve ser uma das 27 unidades federativas do Brasil";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validador implements ConstraintValidator<UfValida, String> {

		/**
		 * Nulo e branco passam de proposito: obrigatoriedade e' assunto do
		 * @NotBlank. Uma anotacao que valida duas coisas devolveria duas
		 * mensagens para o mesmo campo quando ele viesse vazio.
		 */
		@Override
		public boolean isValid(String valor, ConstraintValidatorContext contexto) {
			if (valor == null || valor.isBlank()) {
				return true;
			}
			return UnidadeFederativa.existe(valor);
		}
	}
}
