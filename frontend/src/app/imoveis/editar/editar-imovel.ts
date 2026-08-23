import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { ImovelFormulario } from '../formulario/imovel-formulario';
import { Imovel, ImovelPayload } from '../imovel.model';
import { ImovelService } from '../imovel.service';
import { AvisoEntreRotas } from '../../core/aviso-entre-rotas';
import { mensagemDeErro } from '../../core/mensagem-de-erro';

@Component({
  selector: 'app-editar-imovel',
  imports: [ImovelFormulario, RouterLink],
  templateUrl: './editar-imovel.html',
  styleUrl: './editar-imovel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditarImovel implements OnInit {

  private readonly service = inject(ImovelService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly avisoEntreRotas = inject(AvisoEntreRotas);

  private id = 0;

  readonly imovel = signal<Imovel | null>(null);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    const parametro = Number(this.rota.snapshot.paramMap.get('id'));

    if (!Number.isInteger(parametro) || parametro <= 0) {
      this.erro.set('Identificador de imóvel inválido.');
      this.carregando.set(false);
      return;
    }

    this.id = parametro;

    // Vindo da listagem, o service resolve de forma síncrona e nenhuma
    // requisição sai. Só busca em acesso direto pela URL.
    this.service.buscarPorId(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.carregando.set(false)))
      .subscribe({
        next: imovel => this.imovel.set(imovel),
        error: erro => this.erro.set(mensagemDeErro(erro)),
      });
  }

  salvar(payload: ImovelPayload): void {
    this.salvando.set(true);
    this.erro.set(null);

    this.service.atualizar(this.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.salvando.set(false)))
      .subscribe({
        // O store já recebeu a resposta do PUT: a listagem renderiza o dado
        // novo sem buscar nada.
        next: atualizado => {
          this.avisoEntreRotas.publicar({
            texto: `Imóvel de ${atualizado.proprietario} atualizado.`,
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
