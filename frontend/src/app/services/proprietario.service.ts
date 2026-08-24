import { Injectable, computed, signal } from '@angular/core';
import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { StorePaginado } from './store-paginado';
import { TAMANHO_DE_PAGINA_PADRAO } from '../models/pagina.model';
import { CpfPayload, Proprietario, ProprietarioPayload } from '../models/proprietario.model';

/**
 * Store separado do de imóveis: as duas telas têm ciclos de vida independentes,
 * e um store comum faria uma invalidar a outra sem necessidade. O que elas
 * compartilham é a *mecânica* de paginação, que mora em `StorePaginado`.
 */
@Injectable({ providedIn: 'root' })
export class ProprietarioService extends StorePaginado<Proprietario> {

  protected readonly url = `${environment.apiUrl}/proprietarios`;
  protected readonly mensagemDeFalha =
    'Não foi possível carregar os proprietários. Verifique se o servidor está no ar.';

  private readonly _nome = signal('');

  readonly nome = this._nome.asReadonly();

  /** Nome de domínio para `itens`, para as telas lerem como o que são. */
  readonly proprietarios = this.itens;

  readonly temFiltroAtivo = computed(() => this._nome().length > 0);

  aplicarFiltro(nome: string): void {
    this._nome.set(nome);
    this.buscar(0).subscribe();
  }

  /**
   * A propagação para os imóveis acontece no banco, pela chave estrangeira:
   * não há nada a sincronizar aqui.
   */
  renomear(id: number, payload: ProprietarioPayload): Observable<Proprietario> {
    return this.http.put<Proprietario>(`${this.url}/${id}`, payload).pipe(
      tap(atualizado => this.substituirNaPagina(id, atualizado)),
    );
  }

  /**
   * Dá documento a um proprietário que ainda não tem.
   *
   * `PATCH` no proprietário, e não um campo a mais no salvamento do imóvel: o
   * id na rota é a afirmação de que o documento é **daquela** pessoa. Salvar o
   * imóvel com um CPF novo faz outra coisa — cria um proprietário e transfere o
   * imóvel para ele —, e as duas precisam continuar distinguíveis.
   */
  identificar(id: number, payload: CpfPayload): Observable<Proprietario> {
    return this.http.patch<Proprietario>(`${this.url}/${id}/cpf`, payload).pipe(
      tap(atualizado => this.substituirNaPagina(id, atualizado)),
    );
  }

  buscarPorId(id: number): Observable<Proprietario> {
    const emMemoria = this.proprietarios().find(proprietario => proprietario.id === id);
    return emMemoria ? of(emMemoria) : this.http.get<Proprietario>(`${this.url}/${id}`);
  }

  /**
   * Quem já está cadastrado com este CPF, ou `null` se ninguém.
   *
   * O 404 do servidor vira `null` em vez de erro: para quem está preenchendo o
   * formulário, "este CPF ainda não tem dono" é resposta, não falha. Qualquer
   * outro status continua sendo erro e sobe para quem chamou.
   */
  buscarPorCpf(cpf: string): Observable<Proprietario | null> {
    return this.http.get<Proprietario>(`${this.url}/cpf/${cpf}`).pipe(
      catchError((erro: HttpErrorResponse) =>
        erro.status === 404 ? of(null) : throwError(() => erro)),
    );
  }

  protected montarParametros(numeroDaPagina: number): HttpParams {
    let parametros = new HttpParams()
      .set('page', numeroDaPagina)
      .set('size', TAMANHO_DE_PAGINA_PADRAO);

    if (this._nome().length > 0) {
      parametros = parametros.set('nome', this._nome());
    }

    return parametros;
  }
}
