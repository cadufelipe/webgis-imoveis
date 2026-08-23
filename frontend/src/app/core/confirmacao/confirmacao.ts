import {
  ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild,
} from '@angular/core';

/**
 * Pergunta de confirmação, no lugar do `confirm()` do navegador — que trava a
 * thread e é suprimível pelo usuário, devolvendo `false` em silêncio: o botão
 * de excluir pararia de funcionar sem erro nenhum.
 *
 * `<dialog>` nativo em vez de `<div>` com overlay: já traz foco preso, Esc,
 * `aria-modal` e o resto da página inerte.
 */
@Component({
  selector: 'app-confirmacao',
  templateUrl: './confirmacao.html',
  styleUrl: './confirmacao.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Confirmacao {

  readonly pergunta = input.required<string>();
  readonly rotuloConfirmar = input('Confirmar');

  readonly confirmado = output<void>();
  readonly cancelado = output<void>();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    // showModal() só vale depois de o elemento existir no DOM.
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  confirmar(): void {
    this.fecharDialogo();
    this.confirmado.emit();
  }

  /**
   * Serve ao botão "Cancelar" e ao Esc. O Esc chega pelo evento `cancel`, que é
   * disparado *antes* do fechamento — daí o close explícito aqui, em vez de
   * depender do `close` que viria depois.
   */
  cancelar(): void {
    this.fecharDialogo();
    this.cancelado.emit();
  }

  private fecharDialogo(): void {
    const elemento = this.dialogo().nativeElement;
    if (elemento.open) {
      elemento.close();
    }
  }
}
