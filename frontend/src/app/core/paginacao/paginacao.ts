import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Navegação entre páginas, compartilhada pelas três listagens.
 *
 * `primeira` e `ultima` são derivados, e não recebidos: a API também os
 * devolve, mas passá-los como entrada abriria a chance de discordarem de
 * `pagina` e `totalDePaginas` — dois botões desabilitados no meio da lista.
 *
 * O componente decide sozinho se aparece; sem isso as três telas repetiriam o
 * mesmo `@if` em volta dele.
 */
@Component({
  selector: 'app-paginacao',
  templateUrl: './paginacao.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Paginacao {

  /** Página atual, zero-indexada — como a API a devolve. */
  readonly pagina = input.required<number>();
  readonly totalDePaginas = input.required<number>();

  /** Emite o número da página desejada, também zero-indexado. */
  readonly irPara = output<number>();

  readonly primeira = computed(() => this.pagina() <= 0);
  readonly ultima = computed(() => this.pagina() >= this.totalDePaginas() - 1);
}
