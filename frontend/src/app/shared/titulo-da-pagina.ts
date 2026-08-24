import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

const MARCA = 'WebGIS';

/**
 * Compõe o título de cada rota com o nome do sistema: "Imóveis · WebGIS".
 *
 * Sem isto o Router substitui o <title> do index.html pelo título da rota, e a
 * aba passa a dizer só "Imóveis" — quem tem várias abas abertas perde a
 * referência de qual sistema é qual.
 */
@Injectable()
export class TituloDaPagina extends TitleStrategy {

  private readonly title = inject(Title);

  override updateTitle(estado: RouterStateSnapshot): void {
    const pagina = this.buildTitle(estado);
    this.title.setTitle(pagina ? `${pagina} · ${MARCA}` : MARCA);
  }
}
