import { HttpErrorResponse } from '@angular/common/http';

/** Corpo de erro no formato RFC 7807 devolvido pelo ManipuladorDeErros do backend. */
interface ProblemDetail {
  title?: string;
  detail?: string;
  erros?: Record<string, string>;
  codigo?: string;
}

/**
 * Converte a falha HTTP na frase que o usuário vê.
 * Aproveita o ProblemDetail do backend em vez de mostrar mensagem genérica.
 */
export function mensagemDeErro(erro: unknown): string {
  if (!(erro instanceof HttpErrorResponse)) {
    return 'Ocorreu um erro inesperado.';
  }

  if (erro.status === 0) {
    return 'Servidor indisponível. Verifique se o backend está no ar.';
  }

  const corpo = erro.error as ProblemDetail | null;

  // 400 de validação: o backend manda uma mensagem por campo.
  if (corpo?.erros) {
    return Object.values(corpo.erros).join(' ');
  }

  // 500: o backend devolve um código de correlação para o suporte.
  if (corpo?.codigo) {
    return `${corpo.detail ?? 'Erro interno.'} Código: ${corpo.codigo}`;
  }

  return corpo?.detail ?? corpo?.title ?? 'Não foi possível concluir a operação.';
}
