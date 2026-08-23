import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Template inline: cinco linhas de HTML não justificam um arquivo separado. */
@Component({
  selector: 'app-nao-encontrado',
  imports: [RouterLink],
  template: `
    <h2>Página não encontrada</h2>
    <p>O endereço acessado não existe nesta aplicação.</p>
    <a routerLink="/imoveis">Voltar para a listagem de imóveis</a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NaoEncontrado {}
