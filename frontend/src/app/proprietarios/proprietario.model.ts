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
