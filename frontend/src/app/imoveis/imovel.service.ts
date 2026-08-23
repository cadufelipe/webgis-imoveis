import { Injectable, computed, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { StorePaginado } from '../core/store-paginado';
import { TAMANHO_DE_PAGINA_PADRAO } from '../core/pagina.model';
import { FILTRO_VAZIO, FiltroImoveis } from './filtro.model';
import { Imovel, ImovelPayload } from './imovel.model';

/**
 * Acesso à API de imóveis e store em memória da aplicação.
 *
 * `providedIn: 'root'` garante uma única instância — é o que faz listagem,
 * criação e edição compartilharem estado, e voltar da edição não disparar
 * requisição nenhuma.
 */
@Injectable({ providedIn: 'root' })
export class ImovelService extends StorePaginado<Imovel> {

  protected readonly url = `${environment.apiUrl}/imoveis`;
  protected readonly mensagemDeFalha =
    'Não foi possível carregar os imóveis. Verifique se o servidor está no ar.';

  private readonly _filtro = signal<FiltroImoveis>(FILTRO_VAZIO);
  private readonly _tamanho = signal<number>(TAMANHO_DE_PAGINA_PADRAO);

  readonly filtro = this._filtro.asReadonly();
  readonly tamanho = this._tamanho.asReadonly();

  /** Nome de domínio para `itens`, para as telas lerem como o que são. */
  readonly imoveis = this.itens;

  readonly temFiltroAtivo = computed(() => {
    const filtro = this._filtro();
    return filtro.proprietario.length > 0 || filtro.municipio.length > 0;
  });

  /**
   * Só desta página: somar o conjunto inteiro exigiria uma consulta de
   * agregação dedicada. O nome deixa o recorte explícito na tela.
   */
  readonly areaDaPagina = computed(() =>
    this.imoveis().reduce((total, imovel) => total + (imovel.areaM2 ?? 0), 0));

  aplicarFiltro(filtro: FiltroImoveis): void {
    this._filtro.set(filtro);
    this.buscar(0).subscribe();
  }

  alterarTamanho(tamanho: number): void {
    this._tamanho.set(tamanho);
    this.buscar(0).subscribe();
  }

  /** Lê do store, sem tocar na rede. Undefined se não estiver na página atual. */
  emMemoria(id: number): Imovel | undefined {
    return this.imoveis().find(imovel => imovel.id === id);
  }

  /** Só vai ao servidor quando a edição foi aberta direto pela URL. */
  buscarPorId(id: number): Observable<Imovel> {
    const jaCarregado = this.emMemoria(id);
    return jaCarregado ? of(jaCarregado) : this.http.get<Imovel>(`${this.url}/${id}`);
  }

  /**
   * Após criar, recarrega: com filtro e ordenação alfabética não há como saber
   * em qual página o novo imóvel caiu. Inserir no array local mostraria a lista
   * numa ordem que um F5 desmentiria.
   */
  criar(payload: ImovelPayload): Observable<Imovel> {
    return this.http.post<Imovel>(this.url, payload).pipe(
      tap(() => this.buscar(this.pagina()).subscribe()),
    );
  }

  /**
   * Substitui o item em memória pela resposta do PUT: é o que cumpre o
   * requisito de não haver requisição ao voltar da edição.
   */
  atualizar(id: number, payload: ImovelPayload): Observable<Imovel> {
    return this.http.put<Imovel>(`${this.url}/${id}`, payload).pipe(
      tap(atualizado => this.substituirNaPagina(id, atualizado)),
    );
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`).pipe(
      tap(() => this.removerDaPagina(id)),
    );
  }

  /**
   * Filtro em branco não vira parâmetro: a URL fica limpa e o backend não
   * adiciona predicado inútil na consulta.
   */
  protected montarParametros(numeroDaPagina: number): HttpParams {
    const filtro = this._filtro();

    let parametros = new HttpParams()
      .set('page', numeroDaPagina)
      .set('size', this._tamanho());

    if (filtro.proprietario.length > 0) {
      parametros = parametros.set('proprietario', filtro.proprietario);
    }
    if (filtro.municipio.length > 0) {
      parametros = parametros.set('municipio', filtro.municipio);
    }

    return parametros;
  }
}
