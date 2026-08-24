import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AreaPipe } from '../../pipes/area.pipe';
import { mensagemDeErro } from '../../shared/mensagem-de-erro';
import { Paginacao } from '../../components/paginacao/paginacao';
import { SimNaoPipe } from '../../pipes/sim-nao.pipe';
import { enderecoDoImovel } from '../../shared/endereco-do-imovel';
import { Proprietario } from '../../models/proprietario.model';
import { ProprietarioService } from '../../services/proprietario.service';
import { ImoveisDoProprietarioStore } from '../../services/imoveis-do-proprietario.store';

@Component({
  selector: 'app-imoveis-do-proprietario',
  imports: [RouterLink, AreaPipe, SimNaoPipe, Paginacao],
  templateUrl: './imoveis-do-proprietario.html',
  styleUrl: './imoveis-do-proprietario.scss',
  providers: [ImoveisDoProprietarioStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImoveisDoProprietario implements OnInit {

  private readonly service = inject(ProprietarioService);
  private readonly rota = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly store = inject(ImoveisDoProprietarioStore);

  readonly proprietario = signal<Proprietario | null>(null);

  /** Falha ao identificar o proprietário. A da lista fica no store. */
  private readonly erroDoProprietario = signal<string | null>(null);

  readonly falha = computed(() => this.erroDoProprietario() ?? this.store.erro());

  readonly linhas = computed(() => this.store.itens().map(imovel => ({
    imovel,
    endereco: enderecoDoImovel(imovel),
  })));

  ngOnInit(): void {
    const parametro = Number(this.rota.snapshot.paramMap.get('id'));

    if (!Number.isInteger(parametro) || parametro <= 0) {
      this.erroDoProprietario.set('Identificador de proprietário inválido.');
      return;
    }

    this.service.buscarPorId(parametro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: proprietario => this.proprietario.set(proprietario),
        error: erro => this.erroDoProprietario.set(mensagemDeErro(erro)),
      });

    this.store.paraOProprietario(parametro);
  }

}
