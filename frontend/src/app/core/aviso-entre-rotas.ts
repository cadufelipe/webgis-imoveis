import { Injectable } from '@angular/core';

import { Mensagem } from './mensagem';

/**
 * Entrega uma mensagem para a próxima tela: cadastrar e editar terminam
 * navegando, e o componente que sabe o que aconteceu é destruído antes de poder
 * mostrar qualquer coisa.
 *
 * Não usa o `state` do Router de propósito — aquilo vive no `history.state` e
 * sobrevive ao F5, então "Imóvel cadastrado" reapareceria a cada recarga da
 * listagem. Aqui a caixa é de uso único: quem lê, esvazia.
 */
@Injectable({ providedIn: 'root' })
export class AvisoEntreRotas {

  private pendente: Mensagem | null = null;

  publicar(mensagem: Mensagem): void {
    this.pendente = mensagem;
  }

  /** Devolve a mensagem pendente e a descarta: mostrar duas vezes seria ruído. */
  consumir(): Mensagem | null {
    const mensagem = this.pendente;
    this.pendente = null;
    return mensagem;
  }
}
