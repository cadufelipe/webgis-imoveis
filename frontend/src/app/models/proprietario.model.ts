/** Proprietário como a API devolve — espelha o ProprietarioResponse do backend. */
export interface Proprietario {
  id: number;
  nome: string;
  /** Só dígitos, ou null para quem foi cadastrado antes de o CPF existir. */
  cpf: string | null;
  quantidadeDeImoveis: number;
}

/** Corpo aceito na renomeação. */
export interface ProprietarioPayload {
  nome: string;
}

/**
 * Corpo aceito ao dar documento a quem foi cadastrado antes de o CPF existir.
 *
 * Só o CPF: quem chama já escolheu **qual** registro está documentando, pelo id
 * da rota. É o que separa "é esta pessoa" de "é alguém com o mesmo nome" — o
 * servidor não deduz mais isso sozinho.
 */
export interface CpfPayload {
  cpf: string;
}
