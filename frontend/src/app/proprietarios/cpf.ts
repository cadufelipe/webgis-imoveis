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
