import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { ImovelFormulario } from '../formulario/imovel-formulario';
import { ImovelPayload } from '../imovel.model';
import { ImovelService } from '../imovel.service';
import { AvisoEntreRotas } from '../../core/aviso-entre-rotas';
import { mensagemDeErro } from '../../core/mensagem-de-erro';

@Component({
  selector: 'app-novo-imovel',
  imports: [ImovelFormulario, RouterLink],
  templateUrl: './novo-imovel.html',
  styleUrl: './novo-imovel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NovoImovel {

  private readonly service = inject(ImovelService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly avisoEntreRotas = inject(AvisoEntreRotas);

  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  salvar(payload: ImovelPayload): void {
    this.salvando.set(true);
    this.erro.set(null);

    this.service.criar(payload)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.salvando.set(false)))
      .subscribe({
        // O nome vem da resposta, e não do payload: é o servidor quem decide se
        // o proprietário digitado virou registro novo ou reaproveitou um
        // existente, com a grafia que já estava lá.
        next: criado => {
          this.avisoEntreRotas.publicar({
            texto: `Imóvel de ${criado.proprietario} cadastrado.`,
            tom: 'sucesso',
          });
          this.router.navigate(['/imoveis']);
        },
        error: erro => this.erro.set(mensagemDeErro(erro)),
      });
  }

  voltar(): void {
    this.router.navigate(['/imoveis']);
  }
}
