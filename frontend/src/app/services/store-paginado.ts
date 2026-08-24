import { computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, catchError, defer, finalize, tap } from 'rxjs';

import { Pagina } from '../models/pagina.model';

/**
 * Base das três listagens paginadas. O que sobra para cada subclasse é só o que
 * difere: o endereço na API, a frase de falha e quais filtros viram parâmetro.
 *
 * `T extends { id: number }` porque substituir e remover item da página em
 * memória precisam identificar a linha, e todo recurso desta API tem `id`.
 */
export abstract class StorePaginado<T extends { id: number }> {

  protected readonly http = inject(HttpClient);

  private readonly _resultado = signal<Pagina<T> | null>(null);
  private readonly _carregando = signal(false);
  private readonly _erro = signal<string | null>(null);

  readonly carregando = this._carregando.asReadonly();
  readonly erro = this._erro.asReadonly();

  readonly itens = computed(() => this._resultado()?.conteudo ?? []);
  readonly pagina = computed(() => this._resultado()?.pagina ?? 0);
  readonly totalDePaginas = computed(() => this._resultado()?.totalDePaginas ?? 0);
  readonly totalDeItens = computed(() => this._resultado()?.totalDeItens ?? 0);

  // `primeira` e `ultima` chegam na resposta e continuam no tipo Pagina<T>, mas
  // não viram derivados: o <app-paginacao> os calcula de pagina/totalDePaginas,
  // e são dois sinais a menos para manter em sincronia.

  /** Endereço da coleção na API. */
  protected abstract readonly url: string;

  /** Frase mostrada ao usuário quando a carga falha. */
  protected abstract readonly mensagemDeFalha: string;

  /** Paginação mais os filtros próprios de cada listagem. */
  protected abstract montarParametros(numeroDaPagina: number): HttpParams;

  /**
   * Chamado no ngOnInit das listagens: na primeira visita busca, nas seguintes
   * — inclusive ao voltar da edição — mantém a página onde o usuário estava.
   */
  carregarSeNecessario(): void {
    if (this._resultado() !== null || this._carregando()) {
      return;
    }
    this.buscar(0).subscribe();
  }

  irParaPagina(numero: number): void {
    if (numero < 0 || (this.totalDePaginas() > 0 && numero >= this.totalDePaginas())) {
      return;
    }
    this.buscar(numero).subscribe();
  }

  recarregar(): void {
    this.buscar(this.pagina()).subscribe();
  }

  /**
   * `defer` para que carregando/erro só mudem quando alguém assinar: sem ele,
   * montar o observable já sujaria o estado mesmo sem busca nenhuma acontecer.
   */
  protected buscar(numeroDaPagina: number): Observable<Pagina<T>> {
    return defer(() => {
      this._carregando.set(true);
      this._erro.set(null);
      return this.http.get<Pagina<T>>(this.url, { params: this.montarParametros(numeroDaPagina) });
    }).pipe(
      tap(resultado => this._resultado.set(resultado)),
      catchError(() => {
        this._erro.set(this.mensagemDeFalha);
        return EMPTY;
      }),
      finalize(() => this._carregando.set(false)),
    );
  }

  /** Troca um item da página em memória pela versão que o servidor devolveu. */
  protected substituirNaPagina(id: number, atualizado: T): void {
    this._resultado.update(resultado => resultado === null ? resultado : {
      ...resultado,
      conteudo: resultado.conteudo.map(item => (item.id === id ? atualizado : item)),
    });
  }

  /**
   * Tira o item da página em memória. O total acompanha para o rodapé não
   * anunciar um item a mais do que a lista mostra.
   */
  protected removerDaPagina(id: number): void {
    this._resultado.update(resultado => resultado === null ? resultado : {
      ...resultado,
      conteudo: resultado.conteudo.filter(item => item.id !== id),
      totalDeItens: resultado.totalDeItens - 1,
    });
  }
}
