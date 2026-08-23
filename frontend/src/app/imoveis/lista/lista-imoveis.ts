import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AreaPipe } from '../../core/area.pipe';
import { AvisoEntreRotas } from '../../core/aviso-entre-rotas';
import { Confirmacao } from '../../core/confirmacao/confirmacao';
import { ESPERA_DO_FILTRO } from '../../core/interacao';
import { Mensagem } from '../../core/mensagem';
import { mensagemDeErro } from '../../core/mensagem-de-erro';
import { Paginacao } from '../../core/paginacao/paginacao';
import { SimNaoPipe } from '../../core/sim-nao.pipe';
import { TAMANHOS_DE_PAGINA } from '../../core/pagina.model';
import { FILTRO_VAZIO } from '../filtro.model';
import { enderecoDoImovel } from '../endereco-do-imovel';
import { Imovel } from '../imovel.model';
import { ImovelService } from '../imovel.service';

@Component({
  selector: 'app-lista-imoveis',
  imports: [RouterLink, ReactiveFormsModule, AreaPipe, SimNaoPipe, Paginacao, Confirmacao],
  templateUrl: './lista-imoveis.html',
  styleUrl: './lista-imoveis.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListaImoveis implements OnInit {

  // protected para o template ler direto do store, sem uma camada de apelidos
  // (`readonly pagina = this.service.pagina`, e mais oito) para manter.
  protected readonly service = inject(ImovelService);

  private readonly destroyRef = inject(DestroyRef);
  private readonly avisoEntreRotas = inject(AvisoEntreRotas);

  readonly tamanhosDisponiveis = TAMANHOS_DE_PAGINA;

  /** Endereço formatado uma vez por mudança do store, não a cada ciclo de render. */
  readonly linhas = computed(() => this.service.imoveis().map(imovel => ({
    imovel,
    endereco: enderecoDoImovel(imovel),
  })));

  readonly excluindoId = signal<number | null>(null);

  /** Imóvel aguardando confirmação, ou null se o diálogo está fechado. */
  readonly aExcluir = signal<Imovel | null>(null);
  readonly mensagem = signal<Mensagem | null>(null);

  readonly filtroForm = new FormGroup({
    proprietario: new FormControl('', { nonNullable: true }),
    municipio: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // Debounce evita uma requisição por tecla; distinctUntilChanged evita
    // rebuscar quando o texto voltou ao mesmo valor.
    this.filtroForm.valueChanges
      .pipe(
        debounceTime(ESPERA_DO_FILTRO),
        distinctUntilChanged((anterior, atual) =>
          anterior.proprietario === atual.proprietario && anterior.municipio === atual.municipio),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.mensagem.set(null);
        this.service.aplicarFiltro(this.filtroForm.getRawValue());
      });
  }

  ngOnInit(): void {
    // Repõe o filtro já ativo — `emitEvent: false` para a reposição não
    // disparar mais uma busca.
    this.filtroForm.setValue(this.service.filtro(), { emitEvent: false });
    this.service.carregarSeNecessario();

    // Confirmação deixada por NovoImovel ou EditarImovel antes de navegar.
    this.mensagem.set(this.avisoEntreRotas.consumir());
  }

  limparFiltros(): void {
    this.filtroForm.setValue(FILTRO_VAZIO);
  }

  alterarTamanho(evento: Event): void {
    const selecao = evento.target as HTMLSelectElement;
    this.mensagem.set(null);
    this.service.alterarTamanho(Number(selecao.value));
  }

  irParaPagina(numero: number): void {
    this.mensagem.set(null);
    this.service.irParaPagina(numero);
  }

  pedirExclusao(imovel: Imovel): void {
    this.mensagem.set(null);
    this.aExcluir.set(imovel);
  }

  cancelarExclusao(): void {
    this.aExcluir.set(null);
  }

  confirmarExclusao(imovel: Imovel): void {
    this.aExcluir.set(null);
    this.excluindoId.set(imovel.id);

    this.service.excluir(imovel.id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.excluindoId.set(null)))
      .subscribe({
        next: () => this.mensagem.set({
          texto: `Imóvel de ${imovel.proprietario} excluído.`,
          tom: 'sucesso',
        }),
        error: erro => this.mensagem.set({ texto: mensagemDeErro(erro), tom: 'erro' }),
      });
  }

  recarregar(): void {
    this.mensagem.set(null);
    this.service.recarregar();
  }

}
