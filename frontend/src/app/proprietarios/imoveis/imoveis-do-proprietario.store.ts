import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import { TAMANHO_DE_PAGINA_PADRAO } from '../../core/pagina.model';
import { StorePaginado } from '../../core/store-paginado';
import { Imovel } from '../../imoveis/imovel.model';

/**
 * Sem `providedIn: 'root'`: fornecido pelo componente, então cada visita nasce
 * limpa. Um singleton guardaria a página de um proprietário para o próximo.
 *
 * Reaproveita `GET /api/imoveis` com o filtro `proprietarioId`, em vez de uma
 * rota aninhada — é o mesmo recurso, só que restrito. E não usa o
 * `ImovelService` porque sobrescrever aquele store faria a listagem principal
 * perder a página e o filtro que o usuário deixou lá.
 */
@Injectable()
export class ImoveisDoProprietarioStore extends StorePaginado<Imovel> {

  protected readonly url = `${environment.apiUrl}/imoveis`;
  protected readonly mensagemDeFalha = 'Não foi possível carregar os imóveis deste proprietário.';

  private proprietarioId = 0;

  paraOProprietario(id: number): void {
    this.proprietarioId = id;
    this.buscar(0).subscribe();
  }

  protected montarParametros(numeroDaPagina: number): HttpParams {
    return new HttpParams()
      .set('proprietarioId', this.proprietarioId)
      .set('page', numeroDaPagina)
      .set('size', TAMANHO_DE_PAGINA_PADRAO);
  }
}
