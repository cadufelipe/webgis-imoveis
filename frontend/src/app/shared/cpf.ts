import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Regras do CPF na tela — as mesmas que o backend aplica em `Cpf.java`.
 *
 * Duplicar a validação aqui não é redundância inútil: sem ela, o usuário só
 * descobre que digitou o documento errado depois de submeter o formulário
 * inteiro, e a consulta "este CPF já tem dono?" sairia para a rede sabendo de
 * antemão que não vai achar nada.
 *
 * Quem decide de verdade continua sendo o servidor — este arquivo adianta a
 * resposta, não a substitui.
 */

export const TAMANHO_DO_CPF = 11;

/**
 * Validador do campo, para o CPF entrar no `form.invalid` como qualquer outro.
 *
 * Devolve `{ cpf: true }` só quando há algo digitado e o algo não é um CPF —
 * campo vazio é assunto do `Validators.required`, e acumular as duas
 * responsabilidades aqui mostraria dois erros para o mesmo campo em branco.
 */
export function cpfValidator(controle: AbstractControl): ValidationErrors | null {
  const valor = (controle.value ?? '') as string;
  return valor.trim().length === 0 || cpfValido(valor) ? null : { cpf: true };
}

/** Só os dígitos: a máscara é da tela, e o banco guarda sem pontuação. */
export function apenasDigitosDoCpf(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** 11144477735 → 111.444.777-35, para exibir em lista e em campo já preenchido. */
export function formatarCpf(cpf: string | null): string {
  if (cpf === null) {
    return '—';
  }

  const digitos = apenasDigitosDoCpf(cpf);

  if (digitos.length !== TAMANHO_DO_CPF) {
    return cpf;
  }

  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

/**
 * Máscara de digitação: 52998224725 → 529.982.247-25, e qualquer prefixo dele.
 *
 * Diferente de `formatarCpf`, que só formata documento completo e existe para
 * exibir: esta roda a cada tecla, então precisa dar conta de valor pela metade.
 */
export function mascaraDeCpf(valor: string): string {
  const digitos = apenasDigitosDoCpf(valor).slice(0, TAMANHO_DO_CPF);

  let formatado = digitos.slice(0, 3);

  if (digitos.length > 3) {
    formatado += `.${digitos.slice(3, 6)}`;
  }
  if (digitos.length > 6) {
    formatado += `.${digitos.slice(6, 9)}`;
  }
  if (digitos.length > 9) {
    formatado += `-${digitos.slice(9)}`;
  }

  return formatado;
}

/**
 * Confere os dois dígitos verificadores, e não só o tamanho.
 *
 * Os 11 dígitos repetidos são recusados à parte porque eles **passam** na
 * conta: "111.111.111-11" tem verificador correto e não é CPF de ninguém.
 */
export function cpfValido(valor: string): boolean {
  const digitos = apenasDigitosDoCpf(valor);

  if (digitos.length !== TAMANHO_DO_CPF || todosIguais(digitos)) {
    return false;
  }

  return digitoConfere(digitos, 9, 10) && digitoConfere(digitos, 10, 11);
}

function digitoConfere(digitos: string, posicao: number, pesoInicial: number): boolean {
  let soma = 0;

  for (let i = 0; i < posicao; i++) {
    soma += Number(digitos[i]) * (pesoInicial - i);
  }

  const resto = soma % TAMANHO_DO_CPF;
  const esperado = resto < 2 ? 0 : TAMANHO_DO_CPF - resto;

  return Number(digitos[posicao]) === esperado;
}

function todosIguais(digitos: string): boolean {
  return new Set(digitos).size === 1;
}
