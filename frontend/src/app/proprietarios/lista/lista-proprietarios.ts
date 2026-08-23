import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { ESPERA_DO_FILTRO } from '../../core/interacao';
import { mensagemDeErro } from '../../core/mensagem-de-erro';
import { Paginacao } from '../../core/paginacao/paginacao';
import { Proprietario } from '../proprietario.model';
import { ProprietarioService } from '../proprietario.service';
import { formatarCpf } from '../cpf';

@Component({
  selector: 'app-lista-proprietarios',
  imports: [RouterLink, ReactiveFormsModule, Paginacao],
  templateUrl: './lista-proprietarios.html',
  styleUrl: './lista-proprietarios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** O CPF vem só com dígitos da API; a pontuação é decisão de tela. */
export class ListaProprietarios implements OnInit {

  // protected: o template le direto do store, sem copia intermediaria aqui.
  protected readonly service = inject(ProprietarioService);

  private readonly destroyRef = inject(DestroyRef);

  /**
   * FormGroup mesmo para um campo so: e a FormGroupDirective que liga o ngSubmit.
   * Com <form> sem [formGroup], o submit seria o nativo do navegador e a pagina
   * recarregaria.
   */
  readonly filtroForm = new FormGroup({
    nome: new FormControl('', { nonNullable: true }),
  });

  readonly renomearForm = new FormGroup({
    nome: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
  });

  /** Id do proprietário em edição inline, ou null se nenhum. */
  readonly renomeandoId = signal<number | null>(null);

  protected readonly cpfFormatado = formatarCpf;
  readonly salvando = signal(false);
  readonly aviso = signal<string | null>(null);
  readonly erroDeRenomear = signal<string | null>(null);

  constructor() {
    this.filtroForm.controls.nome.valueChanges
      .pipe(debounceTime(ESPERA_DO_FILTRO), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(nome => {
        this.aviso.set(null);
        this.service.aplicarFiltro(nome);
      });
  }

  ngOnInit(): void {
    this.filtroForm.controls.nome.setValue(this.service.nome(), { emitEvent: false });
    this.service.carregarSeNecessario();
  }

  iniciarRenomear(proprietario: Proprietario): void {
    this.aviso.set(null);
    this.erroDeRenomear.set(null);
    this.renomeandoId.set(proprietario.id);
    this.renomearForm.controls.nome.setValue(proprietario.nome);
  }

  cancelarRenomear(): void {
    this.renomeandoId.set(null);
    this.erroDeRenomear.set(null);
  }

  confirmarRenomear(proprietario: Proprietario): void {
    if (this.renomearForm.invalid) {
      this.renomearForm.markAllAsTouched();
      return;
    }

    const nome = this.renomearForm.getRawValue().nome.trim();
    if (nome === proprietario.nome) {
      this.cancelarRenomear();
      return;
    }

    this.salvando.set(true);
    this.erroDeRenomear.set(null);

    this.service.renomear(proprietario.id, { nome })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.salvando.set(false)))
      .subscribe({
        next: atualizado => {
          this.renomeandoId.set(null);
          this.aviso.set(
            `Renomeado para "${atualizado.nome}" — a mudança vale para os ` +
            `${atualizado.quantidadeDeImoveis} imóvel(is) dele.`);
        },
        error: erro => this.erroDeRenomear.set(mensagemDeErro(erro)),
      });
  }

  irParaPagina(numero: number): void {
    this.aviso.set(null);
    this.service.irParaPagina(numero);
  }

  limparFiltro(): void {
    this.filtroForm.controls.nome.setValue('');
  }

  recarregar(): void {
    this.aviso.set(null);
    this.service.recarregar();
  }
}
