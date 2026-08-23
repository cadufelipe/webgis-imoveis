import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { Imovel, ImovelPayload } from '../imovel.model';
import { CepService } from '../cep/cep.service';
import { EnderecoDoCep, TAMANHO_DO_CEP, apenasDigitos } from '../cep/cep.model';
import { ProprietarioService } from '../../proprietarios/proprietario.service';
import { Proprietario } from '../../proprietarios/proprietario.model';
import { TAMANHO_DO_CPF, apenasDigitosDoCpf, cpfValido, formatarCpf } from '../../proprietarios/cpf';
import { DesenhoDoLote } from '../lote/desenho-do-lote';
import { Vertice, verticesDoGeoJson } from '../lote/lote.model';

/**
 * Formulário de imóvel, compartilhado pelas páginas de criação e de edição.
 *
 * Não conhece HTTP nem rotas: recebe um imóvel para editar (ou nada, para criar)
 * e emite o payload pronto. Quem salva e quem navega é a página que o usa.
 */
@Component({
  selector: 'app-imovel-formulario',
  imports: [ReactiveFormsModule, DesenhoDoLote],
  templateUrl: './imovel-formulario.html',
  styleUrl: './imovel-formulario.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImovelFormulario {

  /** Imóvel a editar. Nulo na criação. */
  readonly imovel = input<Imovel | null>(null);
  readonly salvando = input(false);
  readonly rotuloAcao = input('Salvar');

  readonly salvar = output<ImovelPayload>();
  readonly cancelar = output<void>();

  readonly form = new FormGroup({
    proprietario: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    /**
     * CPF do proprietário. Opcional, mas quando preenchido é **ele** quem
     * identifica a pessoa no servidor — o nome digitado deixa de decidir.
     */
    cpfDoProprietario: new FormControl('', { nonNullable: true }),
    /**
     * Atalho de preenchimento, e não dado do imóvel: o CEP **não** vai no
     * payload nem existe como coluna. Ele serve para trazer município, UF,
     * bairro, rua e — quando a base do CEP tem — a coordenada da via.
     */
    cep: new FormControl('', { nonNullable: true }),
    municipio: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    uf: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{2}$/)],
    }),
    bairro: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    rua: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(150)] }),
    numero: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(10)] }),
    latitude: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(-90), Validators.max(90)],
    }),
    longitude: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(-180), Validators.max(180)],
    }),
    areaM2: new FormControl<number | null>(null, { validators: [Validators.min(0.01)] }),
    largura: new FormControl<number | null>(null, { validators: [Validators.min(0.01)] }),
    comprimento: new FormControl<number | null>(null, { validators: [Validators.min(0.01)] }),
    ativo: new FormControl(true, { nonNullable: true }),
  });

  /**
   * Fora do FormGroup de propósito: o desenho não é um campo digitável, não tem
   * estado touched/dirty e não produz mensagem de erro por campo. Mantê-lo como
   * signal evita um FormControl que nenhum `formControlName` referencia.
   */
  protected readonly poligono = signal<Vertice[] | null>(null);

  /**
   * Se o desenho já passou pelas mãos do usuário nesta tela.
   *
   * Sem esta marca não dá para distinguir "ainda não mexi no lote salvo" de
   * "apaguei o lote de propósito": nos dois casos o desenho emite `null`, e
   * repor o polígono salvo no segundo tornaria impossível remover um lote.
   */
  private readonly desenhoTocado = signal(false);

  /** Lote já salvo, para o mapa reabrir o desenho na edição. */
  protected readonly poligonoSalvo = computed(() => verticesDoGeoJson(this.imovel()?.poligono ?? null));

  protected readonly temPoligono = computed(() => this.poligono() !== null);

  /** Onde o mapa de desenho abre quando ainda não há lote: o ponto digitado. */
  protected readonly centroDoDesenho = signal<Vertice | null>(null);

  private readonly cepService = inject(CepService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly buscandoCep = signal(false);
  protected readonly erroDoCep = signal<string | null>(null);
  protected readonly cepAplicado = signal<string | null>(null);

  /** Último CEP consultado, para não repetir a busca a cada tecla depois do oitavo dígito. */
  private ultimoCepBuscado: string | null = null;

  private readonly proprietarioService = inject(ProprietarioService);

  /** Proprietário que já existe com o CPF digitado, quando existe. */
  protected readonly proprietarioIdentificado = signal<Proprietario | null>(null);
  protected readonly cpfInvalido = signal(false);

  private ultimoCpfBuscado: string | null = null;

  constructor() {
    // setValue copia primitivos: o formulário nunca guarda referência ao objeto
    // do store, então digitar aqui não altera a listagem.
    effect(() => {
      const imovel = this.imovel();
      if (!imovel) {
        return;
      }
      this.form.setValue({
        proprietario: imovel.proprietario,
        cpfDoProprietario: imovel.cpfDoProprietario === null
          ? '' : formatarCpf(imovel.cpfDoProprietario),
        // O imóvel não guarda CEP: na edição o campo nasce vazio, e continua
        // servindo para repreencher o endereço se o usuário quiser.
        cep: '',
        municipio: imovel.municipio,
        uf: imovel.uf,
        bairro: imovel.bairro ?? '',
        rua: imovel.rua ?? '',
        numero: imovel.numero ?? '',
        latitude: imovel.latitude,
        longitude: imovel.longitude,
        areaM2: imovel.areaM2,
        largura: imovel.largura,
        comprimento: imovel.comprimento,
        ativo: imovel.ativo,
      });
    });

    // Com o par de dimensões preenchido a área vira derivada: o backend calcula
    // o produto de qualquer forma, e um campo editável ofereceria um valor que
    // vai ser descartado no servidor.
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.sincronizarArea();
        this.acompanharCoordenada();
        this.consultarCepQuandoCompleto();
        this.identificarProprietarioPeloCpf();
      });

    // Abrir a edição de um lote desenhado precisa carregar o polígono no
    // formulário, e não só no mapa: quem edita o endereço e salva sem tocar no
    // desenho enviaria `poligono: null`, e o backend entenderia isso como
    // "apague a geometria" — o lote sumiria sem ninguém ter pedido.
    effect(() => {
      const salvo = this.poligonoSalvo();

      if (salvo !== null && !this.desenhoTocado()) {
        this.poligono.set(salvo);
        this.sincronizarArea();
      }
    });
  }

  /**
   * Procura quem já tem o CPF digitado, assim que ele fica completo e válido.
   *
   * Achando alguém, o nome do formulário passa a ser o **do cadastro**, e não o
   * que estava digitado: é isso que o servidor vai usar de qualquer forma, e
   * mostrar outro nome na tela até o momento de salvar seria mentir sobre a que
   * proprietário o imóvel vai ficar ligado.
   *
   * A validação local evita a ida à rede com documento que já se sabe inválido.
   */
  private identificarProprietarioPeloCpf(): void {
    const digitos = apenasDigitosDoCpf(this.form.controls.cpfDoProprietario.value);

    if (digitos.length !== TAMANHO_DO_CPF) {
      this.ultimoCpfBuscado = null;
      this.cpfInvalido.set(false);
      this.proprietarioIdentificado.set(null);
      return;
    }

    if (!cpfValido(digitos)) {
      this.ultimoCpfBuscado = null;
      this.cpfInvalido.set(true);
      this.proprietarioIdentificado.set(null);
      return;
    }

    this.cpfInvalido.set(false);

    if (digitos === this.ultimoCpfBuscado) {
      return;
    }

    this.ultimoCpfBuscado = digitos;

    this.proprietarioService.buscarPorCpf(digitos)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: proprietario => {
          this.proprietarioIdentificado.set(proprietario);

          if (proprietario !== null) {
            this.form.controls.proprietario.setValue(proprietario.nome, { emitEvent: false });
          }
        },
        // Falha de rede aqui não trava o cadastro: o servidor refaz a
        // identificação ao salvar, e é a decisão dele que vale.
        error: () => this.proprietarioIdentificado.set(null),
      });
  }

  /**
   * Dispara a consulta assim que o CEP tem oito dígitos.
   *
   * Sem botão: o CEP é um número de tamanho fixo, e quem termina de digitá-lo
   * já disse tudo o que tinha a dizer. `ultimoCepBuscado` evita repetir a
   * chamada nas teclas seguintes — apagar um dígito e redigitá-lo não vale uma
   * segunda ida à rede.
   */
  private consultarCepQuandoCompleto(): void {
    const digitos = apenasDigitos(this.form.controls.cep.value);

    if (digitos.length !== TAMANHO_DO_CEP) {
      this.ultimoCepBuscado = null;
      this.erroDoCep.set(null);
      this.cepAplicado.set(null);
      return;
    }

    if (digitos === this.ultimoCepBuscado) {
      return;
    }

    this.ultimoCepBuscado = digitos;
    this.buscandoCep.set(true);
    this.erroDoCep.set(null);
    this.cepAplicado.set(null);

    this.cepService.buscar(digitos)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.buscandoCep.set(false)))
      .subscribe({
        next: endereco => this.aplicarEndereco(endereco),
        error: (erro: Error) => this.erroDoCep.set(erro.message),
      });
  }

  /**
   * O que veio do CEP entra por cima do endereço, mas **não** por cima da
   * coordenada já preenchida: o CEP localiza a via, e o ponto do imóvel é mais
   * específico que isso — sobrescrevê-lo apagaria um dado melhor por um pior.
   */
  private aplicarEndereco(endereco: EnderecoDoCep): void {
    this.form.patchValue({
      municipio: endereco.municipio,
      uf: endereco.uf,
      bairro: endereco.bairro ?? '',
      rua: endereco.rua ?? '',
    });

    const { latitude, longitude } = this.form.getRawValue();
    const temCoordenadaDoCep = endereco.latitude !== null && endereco.longitude !== null;

    if (temCoordenadaDoCep && latitude === null && longitude === null) {
      this.form.patchValue({ latitude: endereco.latitude, longitude: endereco.longitude });
    }

    this.cepAplicado.set(temCoordenadaDoCep
      ? 'Endereço e coordenada preenchidos pelo CEP.'
      : 'Endereço preenchido pelo CEP. Este CEP não tem coordenada — informe latitude e longitude.');
  }

  /**
   * Mantém o mapa sabendo para onde ir quando alguém pedir "Ir para a
   * coordenada" — quem decide o momento de saltar é o botão de lá, não esta
   * escrita, que acontece a cada tecla.
   */
  private acompanharCoordenada(): void {
    const { latitude, longitude } = this.form.getRawValue();

    this.centroDoDesenho.set(
      latitude === null || longitude === null ? null : { latitude, longitude });
  }

  /**
   * O desenho chega pronto do mapa: nulo enquanto o contorno não fecha, o que
   * mantém `largura`/`comprimento` valendo até existir um lote de verdade.
   */
  protected aoDesenhar(vertices: Vertice[] | null): void {
    this.desenhoTocado.set(true);
    this.poligono.set(vertices);
    this.sincronizarArea();

    if (vertices === null) {
      return;
    }

    // O backend reposiciona o ponto para dentro do lote de qualquer forma
    // (ST_PointOnSurface). Preencher aqui só poupa quem desenhou de digitar uma
    // coordenada que ele já indicou no mapa — e por isso não sobrescreve o que
    // já estiver escrito.
    const { latitude, longitude } = this.form.getRawValue();

    if (latitude === null || longitude === null) {
      const centro = centroAproximado(vertices);
      this.form.patchValue({
        latitude: Number(centro.latitude.toFixed(7)),
        longitude: Number(centro.longitude.toFixed(7)),
      }, { emitEvent: false });
    }
  }

  /**
   * Quem manda na área: o lote desenhado, depois as dimensões, e só então o que
   * for digitado. É a mesma precedência que o backend aplica na gravação — se
   * as duas discordassem, o formulário mostraria um número e o banco guardaria
   * outro.
   *
   * `emitEvent: false` para a escrita não realimentar a assinatura que chama
   * este método, e disable/enable no controle, e não no template: o atributo
   * `disabled` em formulário reativo briga com o estado do FormControl.
   */
  private sincronizarArea(): void {
    const { largura, comprimento } = this.form.getRawValue();
    const area = this.form.controls.areaM2;

    // Com lote desenhado, medida digitada nenhuma sobrevive: a área sai do
    // ST_Area e as dimensões são descartadas no servidor. Deixá-las editáveis
    // seria oferecer campos cujo valor o sistema joga fora.
    if (this.temPoligono()) {
      this.desabilitar(this.form.controls.largura);
      this.desabilitar(this.form.controls.comprimento);
      this.desabilitar(area);
      return;
    }

    this.habilitar(this.form.controls.largura);
    this.habilitar(this.form.controls.comprimento);

    const temPar = largura !== null && comprimento !== null && largura > 0 && comprimento > 0;

    if (temPar) {
      const calculada = Number((largura * comprimento).toFixed(2));
      if (area.value !== calculada) {
        area.setValue(calculada, { emitEvent: false });
      }
      this.desabilitar(area);
      return;
    }

    this.habilitar(area);
  }

  private desabilitar(controle: FormControl<number | null>): void {
    if (controle.enabled) {
      controle.disable({ emitEvent: false });
    }
  }

  private habilitar(controle: FormControl<number | null>): void {
    if (controle.disabled) {
      controle.enable({ emitEvent: false });
    }
  }

  aoSubmeter(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const valores = this.form.getRawValue();

    // O Validators.required já garante isto; o early return deixa o compilador
    // provar, em vez de prometer com "!".
    if (valores.latitude === null || valores.longitude === null) {
      return;
    }

    this.salvar.emit({
      proprietario: valores.proprietario.trim(),
      cpfDoProprietario: this.opcional(valores.cpfDoProprietario),
      municipio: valores.municipio.trim(),
      uf: valores.uf.trim().toUpperCase(),
      bairro: this.opcional(valores.bairro),
      rua: this.opcional(valores.rua),
      numero: this.opcional(valores.numero),
      latitude: valores.latitude,
      longitude: valores.longitude,
      areaM2: valores.areaM2,
      largura: valores.largura,
      comprimento: valores.comprimento,
      poligono: this.poligono(),
      ativo: valores.ativo,
    });
  }

  /** Campo em branco vira null: o backend distingue "não informado" de string vazia. */
  private opcional(valor: string): string | null {
    const limpo = valor.trim();
    return limpo.length > 0 ? limpo : null;
  }
}

/** Média dos vértices — serve para posicionar, não para medir. */
function centroAproximado(vertices: readonly Vertice[]): Vertice {
  const soma = vertices.reduce((acumulado, vertice) => ({
    latitude: acumulado.latitude + vertice.latitude,
    longitude: acumulado.longitude + vertice.longitude,
  }), { latitude: 0, longitude: 0 });

  return {
    latitude: soma.latitude / vertices.length,
    longitude: soma.longitude / vertices.length,
  };
}
