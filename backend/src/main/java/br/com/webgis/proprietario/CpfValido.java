package br.com.webgis.proprietario;

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
 * Recusa CPF que nao existe, e nao apenas o que tem tamanho errado.
 *
 * Mesma forma do {@code @UfValida}: a anotacao nao carrega regra nenhuma, ela
 * pergunta ao {@link Cpf}. Um {@code @Pattern} de 11 digitos aceitaria
 * "00000000000".
 */
@Documented
@Constraint(validatedBy = CpfValido.Validador.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface CpfValido {

	String message() default "CPF inválido";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validador implements ConstraintValidator<CpfValido, String> {

		/**
		 * Nulo e branco passam: o CPF e' opcional, e obrigatoriedade seria
		 * assunto de um @NotBlank. Uma anotacao que valida duas coisas devolveria
		 * duas mensagens para o mesmo campo vazio.
		 */
		@Override
		public boolean isValid(String valor, ConstraintValidatorContext contexto) {
			if (valor == null || valor.isBlank()) {
				return true;
			}
			return Cpf.valido(valor);
		}
	}
}
