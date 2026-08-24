import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, catchError, defer, finalize, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { FILTRO_DO_MAPA_VAZIO, FiltroDoMapa } from '../models/filtro-do-mapa.model';
import { MapaDeImoveis } from '../models/mapa.model';

/**
 * Estado da tela de mapa: os pontos, o filtro e o par carregando/erro.
 *
 * **Não herda de `StorePaginado` de propósito.** Aquele store é construído em
 * torno de `Pagina<T>` — `totalDePaginas`, `irParaPagina`, `primeira`, `última`
 * — e mapa não tem página 2. Herdar traria seis derivados presos em zero e um
 * `irParaPagina` público que ninguém pode chamar. O que de fato se repete são
 * as ~15 linhas do `buscar`, e repeti-las sai mais barato que herdar a
 * abstração errada.
 *
 * Sem `providedIn: 'root'`: o componente fornece, então sair da tela descarta
 * os pontos em vez de manter até 500 imóveis vivos pelo resto da sessão.
 */
@Injectable()
export class MapaStore {

  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/imoveis/mapa`;

  private readonly _resultado = signal<MapaDeImoveis | null>(null);
  private readonly _carregando = signal(false);
  private readonly _erro = signal<string | null>(null);
  private readonly _filtro = signal<FiltroDoMapa>(FILTRO_DO_MAPA_VAZIO);

  readonly carregando = this._carregando.asReadonly();
  readonly erro = this._erro.asReadonly();
  readonly filtro = this._filtro.asReadonly();

  readonly pontos = computed(() => this._resultado()?.pontos ?? []);

  /** Quantos imóveis atendem ao filtro — não quantos estão desenhados. */
  readonly total = computed(() => this._resultado()?.total ?? 0);

  /** Verdadeiro quando o servidor cortou no teto: a tela mostra menos que o total. */
  readonly truncado = computed(() => this._resultado()?.truncado ?? false);

  readonly temFiltroAtivo = computed(() => {
    const filtro = this._filtro();
    return filtro.proprietario.length > 0
      || filtro.uf.length > 0
      || filtro.municipio.length > 0;
  });

  carregar(): void {
    this.buscar().subscribe();
  }

  aplicarFiltro(filtro: FiltroDoMapa): void {
    this._filtro.set(filtro);
    this.buscar().subscribe();
  }

  /**
   * `defer` pelo mesmo motivo do `StorePaginado`: sem ele, montar o observable
   * já sujaria carregando/erro mesmo que ninguém assinasse.
   */
  private buscar(): Observable<MapaDeImoveis> {
    return defer(() => {
      this._carregando.set(true);
      this._erro.set(null);
      return this.http.get<MapaDeImoveis>(this.url, { params: this.montarParametros() });
    }).pipe(
      tap(resultado => this._resultado.set(resultado)),
      catchError(() => {
        this._erro.set('Não foi possível carregar o mapa. Verifique se o servidor está no ar.');
        return EMPTY;
      }),
      finalize(() => this._carregando.set(false)),
    );
  }

  /**
   * Sem `page` e sem `size`: o recorte é decidido no servidor, pelo teto.
   *
   * O filtro é próprio do mapa, e não o do `ImovelService` — compartilhá-lo
   * acoplaria as telas e faria cada tecla digitada aqui rebuscar a listagem.
   * Quem garante que "proprietário" significa o mesmo nas duas é o backend,
   * com um único `ImovelSpecs` servindo aos dois endpoints.
   */
  private montarParametros(): HttpParams {
    const filtro = this._filtro();
    let parametros = new HttpParams();

    if (filtro.proprietario.length > 0) {
      parametros = parametros.set('proprietario', filtro.proprietario);
    }
    if (filtro.uf.length > 0) {
      parametros = parametros.set('uf', filtro.uf);
    }
    if (filtro.municipio.length > 0) {
      parametros = parametros.set('municipio', filtro.municipio);
    }

    return parametros;
  }
}
