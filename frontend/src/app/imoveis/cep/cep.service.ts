import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

import { EnderecoDoCep, RespostaDaBrasilApi } from './cep.model';

/**
 * Base pública da BrasilAPI. A v2 é a que devolve a coordenada da via — a v1
 * traz só o endereço, e sem ela o mapa de desenho continuaria abrindo no país
 * inteiro depois de o usuário já ter dito onde fica o imóvel.
 */
const URL_DA_BRASIL_API = 'https://brasilapi.com.br/api/cep/v2';

/**
 * Consulta de CEP, para preencher o endereço sem digitação.
 *
 * Chamada direto do navegador, e não por um endpoint próprio no backend: é uma
 * conveniência do formulário, não regra de negócio — nada do que vem daqui é
 * gravado sem passar pela validação de sempre. A BrasilAPI responde com
 * `access-control-allow-origin: *`, então o CORS permite.
 *
 * O que o serviço devolve é o `EnderecoDoCep` do projeto, nunca o JSON da API:
 * o formato de terceiro morre nesta classe.
 */
@Injectable({ providedIn: 'root' })
export class CepService {

  private readonly http = inject(HttpClient);

  /**
   * Consultas já feitas. Endereço de CEP não muda durante uma sessão, e sem o
   * cache voltar ao campo e sair dele dispararia a mesma requisição de novo.
   */
  private readonly cache = new Map<string, EnderecoDoCep>();

  buscar(cep: string): Observable<EnderecoDoCep> {
    const emCache = this.cache.get(cep);

    if (emCache !== undefined) {
      return of(emCache);
    }

    return this.http.get<RespostaDaBrasilApi>(`${URL_DA_BRASIL_API}/${cep}`).pipe(
      map(resposta => converter(resposta)),
      tap(endereco => this.cache.set(cep, endereco)),
      catchError((erro: unknown) => throwError(() => new Error(mensagemDeFalha(erro)))),
    );
  }
}

function converter(resposta: RespostaDaBrasilApi): EnderecoDoCep {
  const coordenadas = resposta.location?.coordinates;

  return {
    cep: resposta.cep,
    uf: resposta.state,
    municipio: resposta.city,
    bairro: textoOuNulo(resposta.neighborhood),
    rua: textoOuNulo(resposta.street),
    latitude: numeroOuNulo(coordenadas?.latitude),
    longitude: numeroOuNulo(coordenadas?.longitude),
  };
}

/**
 * A API responde 404 para CEP que não existe em nenhuma das bases que ela
 * consulta — o que, para quem está preenchendo, não é "erro" e sim resposta.
 * Por isso a frase distingue os dois casos em vez de dizer "falha na consulta".
 */
function mensagemDeFalha(erro: unknown): string {
  if (erro instanceof HttpErrorResponse && erro.status === 404) {
    return 'CEP não encontrado. Confira o número ou preencha o endereço à mão.';
  }
  return 'Não foi possível consultar o CEP agora. Preencha o endereço à mão.';
}

function textoOuNulo(valor: string | null | undefined): string | null {
  return valor === null || valor === undefined || valor.trim().length === 0 ? null : valor.trim();
}

/** A BrasilAPI manda a coordenada como texto, e às vezes não manda. */
function numeroOuNulo(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor.trim().length === 0) {
    return null;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
