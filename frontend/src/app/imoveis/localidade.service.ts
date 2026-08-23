import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Municipio, Uf } from './localidade.model';

/**
 * Estados e cidades que existem no cadastro, para alimentar os selects do filtro.
 *
 * Com cache, ao contrário do `MapaStore`: isto é vocabulário, não um recorte
 * que envelhece a cada cadastro. Rebuscar a cada visita ao mapa seria
 * requisição previsivelmente idêntica.
 *
 * O cache é por UF, e não uma lista só: carregar as cidades de todos os estados
 * traria, na base real, milhares de nomes para o usuário olhar os de um.
 */
@Injectable({ providedIn: 'root' })
export class LocalidadeService {

  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/localidades`;

  private readonly _ufs = signal<Uf[]>([]);
  private readonly _municipios = signal<Municipio[]>([]);
  private readonly _erro = signal<string | null>(null);

  private readonly cacheDeMunicipios = new Map<string, Municipio[]>();

  readonly ufs = this._ufs.asReadonly();
  readonly municipios = this._municipios.asReadonly();
  readonly erro = this._erro.asReadonly();

  /** Só busca na primeira vez. Reabrir o mapa não dispara requisição. */
  carregarUfs(): void {
    if (this._ufs().length > 0) {
      return;
    }

    this.http.get<Uf[]>(`${this.url}/ufs`).pipe(
      tap(() => this._erro.set(null)),
      catchError(() => {
        this._erro.set('Não foi possível carregar a lista de estados.');
        return of([]);
      }),
    ).subscribe(ufs => this._ufs.set(ufs));
  }

  carregarMunicipiosDa(sigla: string): void {
    const emCache = this.cacheDeMunicipios.get(sigla);
    if (emCache !== undefined) {
      this._municipios.set(emCache);
      return;
    }

    this.http.get<Municipio[]>(`${this.url}/ufs/${sigla}/municipios`).pipe(
      tap(() => this._erro.set(null)),
      catchError(() => {
        this._erro.set('Não foi possível carregar as cidades deste estado.');
        return of([]);
      }),
    ).subscribe(municipios => {
      // Falha não entra no cache: senão o erro de rede de um instante viraria
      // "este estado não tem cidades" para o resto da sessão.
      if (municipios.length > 0) {
        this.cacheDeMunicipios.set(sigla, municipios);
      }
      this._municipios.set(municipios);
    });
  }

  limparMunicipios(): void {
    this._municipios.set([]);
  }
}
