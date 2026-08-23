/**
 * Uma UF que tem imóveis cadastrados — espelha o UfResponse do backend.
 *
 * A lista vem do banco, e não das 27 constantes: um select com as 27 devolveria
 * "nenhum imóvel" nas que ninguém cadastrou. Quem conhece as 27 é a validação
 * de cadastro — são perguntas diferentes, com fontes diferentes.
 */
export interface Uf {
  sigla: string;
  nome: string;
  quantidadeDeImoveis: number;
}

/** Município com imóveis dentro de uma UF — espelha o MunicipioResponse. */
export interface Municipio {
  nome: string;
  quantidadeDeImoveis: number;
}
