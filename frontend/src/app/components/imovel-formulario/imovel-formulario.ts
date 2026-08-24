import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { Imovel, ImovelPayload } from '../../models/imovel.model';
import { CepService } from '../../services/cep.service';
import { EnderecoDoCep, TAMANHO_DO_CEP, apenasDigitos } from '../../models/cep.model';
import { ProprietarioService } from '../../services/proprietario.service';
import { Proprietario } from '../../models/proprietario.model';
import { TAMANHO_DO_CPF, apenasDigitosDoCpf, cpfValidator, cpfValido, formatarCpf } from '../../shared/cpf';
import { DesenhoDoLote } from '../desenho-do-lote/desenho-do-lote';
import { Vertice, verticesDoGeoJson } from '../../models/lote.model';
import { distanciaEmMetros, distanciaPorExtenso } from '../../shared/distancia';

/**
 * Acima disto, o lote e o CEP não descrevem o mesmo lugar.
 *
 * 2 km cobre com folga a distância entre um terreno e o centro da via em
 * qualquer cidade — inclusive em zona rural, onde um CEP único atende a região
 * inteira. Abaixo desse valor o aviso viraria ruído; acima, é sinal de erro.
 */
const DISTANCIA_SUSPEITA_DO_LOTE = 2000;

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
  // Esc encerra a marcação: é a tecla que todo editor de mapa usa para sair de
  // um modo, e sem ela quem ligou o modo sem querer precisa achar o botão de
  // volta. No documento, e não no host, porque o foco costuma estar no mapa —
  // que fica dentro do componente filho, fora do alcance de um listener local.
  host: { '(document:keydown.escape)': 'encerrarMarcacao()' },
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
     * Obrigatório, e é **ele** quem identifica a pessoa no servidor — o nome
     * digitado não decide. Validado aqui pelos mesmos dígitos verificadores que
     * o backend confere, para o erro aparecer antes do envio.
     */
    cpfDoProprietario: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, cpfValidator],
    }),
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

  /**
   * O mapa do contorno, para os dois comandos que não são estado: saltar até o
   * endereço do CEP e trazer o mapa para a tela quando a marcação começa.
   */
  private readonly mapaDoLote = viewChild.required(DesenhoDoLote);

  /**
   * Botão de alvo armado, à espera do próximo clique no mapa.
   *
   * Mora aqui, e não no mapa, porque é o formulário quem tem a latitude e a
   * longitude: o mapa só empresta o clique. É também o que permite ao botão
   * ficar junto dos campos que ele preenche.
   */
  protected readonly marcandoPonto = signal(false);

  /**
   * Com o lote fechado o alvo sai de cena: a localização gravada passa a ser a
   * do contorno — o backend a recalcula com `ST_PointOnSurface` — e um botão
   * que continuasse funcionando prometeria uma coordenada que o servidor iria
   * descartar.
   */
  protected readonly alvoIndisponivel = computed(() => this.temPoligono());

  /**
   * Rótulo e dica do alvo nos três estados.
   *
   * Em computed, e não em ternário aninhado no template: são três frases longas
   * em dois atributos, e escrevê-las no HTML custaria seis ramos de condicional
   * dentro de aspas.
   */
  protected readonly rotuloDoAlvo = computed(() => {
    if (this.alvoIndisponivel()) {
      return 'Captura no mapa indisponível: a localização vem do contorno desenhado';
    }
    return this.marcandoPonto()
      ? 'Cancelar a captura do ponto no mapa'
      : 'Capturar latitude e longitude com um clique no mapa';
  });

  protected readonly dicaDoAlvo = computed(() => {
    if (this.alvoIndisponivel()) {
      return 'Indisponível: com o contorno fechado, a localização do imóvel sai dele. '
        + 'Remova o desenho para voltar a capturar do mapa.';
    }
    return this.marcandoPonto()
      ? 'Clique no mapa para gravar o ponto — Esc cancela'
      : 'Capturar do mapa: o próximo clique vira a latitude e a longitude';
  });

  private readonly cepService = inject(CepService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly buscandoCep = signal(false);
  protected readonly erroDoCep = signal<string | null>(null);
  protected readonly cepAplicado = signal<string | null>(null);

  /** Último CEP consultado, para não repetir a busca a cada tecla depois do oitavo dígito. */
  private ultimoCepBuscado: string | null = null;

  /**
   * A coordenada que a última consulta de CEP escreveu no formulário.
   *
   * É o que distingue "este ponto veio do CEP anterior, pode trocar" de "alguém
   * ajustou isto à mão, não mexa".
   */
  private coordenadaDoCep: Vertice | null = null;

  private readonly proprietarioService = inject(ProprietarioService);

  /** Proprietário que já existe com o CPF digitado, quando existe. */
  protected readonly proprietarioIdentificado = signal<Proprietario | null>(null);

  /**
   * Editando um imóvel cujo dono é anterior à exigência do CPF.
   *
   * O campo nasce vazio e o formulário passa a recusar o salvamento, o que sem
   * aviso parece defeito — e não é: é a única forma de o cadastro antigo receber
   * documento.
   */
  protected readonly proprietarioSemCpf = computed(() => {
    const imovel = this.imovel();
    return imovel !== null && imovel.cpfDoProprietario === null;
  });

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

    // Documento incompleto ou inválido não vai à rede: a resposta já se sabe.
    if (digitos.length !== TAMANHO_DO_CPF || !cpfValido(digitos)) {
      this.ultimoCpfBuscado = null;
      this.proprietarioIdentificado.set(null);
      return;
    }

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
   * O que veio do CEP entra por cima do endereço. A coordenada também entra,
   * **inclusive trocando a de um CEP anterior**: quem corrige o CEP está
   * mudando de endereço, e deixar o ponto na cidade antiga faria os campos
   * descreverem dois lugares diferentes.
   *
   * O que a coordenada do CEP não sobrescreve é o que veio de outra fonte —
   * digitado à mão, carregado de um imóvel em edição, ou derivado de um lote
   * desenhado. Nesses casos o ponto é mais preciso que o centro da via, e a
   * tela avisa em vez de trocar em silêncio.
   */
  private aplicarEndereco(endereco: EnderecoDoCep): void {
    this.form.patchValue({
      municipio: endereco.municipio,
      uf: endereco.uf,
      bairro: endereco.bairro ?? '',
      rua: endereco.rua ?? '',
    });

    if (endereco.latitude === null || endereco.longitude === null) {
      this.cepAplicado.set(
        'Endereço preenchido pelo CEP. Este CEP não tem coordenada — informe latitude e longitude.');
      return;
    }

    // O salto acontece em todos os casos daqui para baixo, inclusive naqueles em
    // que a coordenada do formulário **não** é trocada: mostrar onde fica o CEP
    // é o que permite conferir se o ponto que ficou é o certo. Só a vista muda;
    // nenhum campo é sobrescrito por isto.
    this.mapaDoLote().focarEm({ latitude: endereco.latitude, longitude: endereco.longitude });

    // Com lote desenhado, quem manda na localização é o contorno — o servidor
    // reposiciona o ponto para dentro dele de qualquer forma. Dizer só "as
    // coordenadas foram mantidas" esconderia o caso perigoso: trocar o CEP para
    // outra cidade e sair com o endereço de um lugar e o lote de outro.
    const lote = this.poligono();

    if (lote !== null) {
      this.cepAplicado.set(this.avisoDoLoteDesenhado(lote, endereco));
      return;
    }

    if (!this.podeUsarCoordenadaDoCep()) {
      this.cepAplicado.set(
        'Endereço preenchido pelo CEP. A latitude e a longitude foram mantidas — apague-as para usar as do CEP.');
      return;
    }

    this.form.patchValue({ latitude: endereco.latitude, longitude: endereco.longitude });
    this.coordenadaDoCep = { latitude: endereco.latitude, longitude: endereco.longitude };
    this.cepAplicado.set('Endereço e coordenada preenchidos pelo CEP.');
  }

  /**
   * Distância entre o lote desenhado e o CEP informado é o que separa "mudei o
   * complemento do endereço" de "colei o CEP errado, ou desenhei no lugar
   * errado". Um lote urbano fica a algumas centenas de metros do centro da via;
   * quilômetros de distância são um dos dois valores estando errado, e a tela
   * precisa dizer isso antes de o cadastro ser salvo assim.
   */
  private avisoDoLoteDesenhado(lote: readonly Vertice[], endereco: EnderecoDoCep): string {
    const distancia = distanciaEmMetros(centroAproximado(lote), {
      latitude: endereco.latitude as number,
      longitude: endereco.longitude as number,
    });

    if (distancia > DISTANCIA_SUSPEITA_DO_LOTE) {
      return `Atenção: o lote desenhado fica a ${distanciaPorExtenso(distancia)} deste CEP. `
        + 'A localização gravada será a do desenho — refaça o contorno se o imóvel mudou de lugar.';
    }

    return 'Endereço preenchido pelo CEP. A localização continua vindo do lote desenhado.';
  }

  /**
   * Verdadeiro quando o ponto atual está vazio ou é exatamente o que um CEP
   * anterior colocou ali — nesses dois casos, trocá-lo não perde informação.
   */
  private podeUsarCoordenadaDoCep(): boolean {
    if (this.temPoligono()) {
      return false;
    }

    const { latitude, longitude } = this.form.getRawValue();

    if (latitude === null && longitude === null) {
      return true;
    }

    return this.coordenadaDoCep !== null
      && latitude === this.coordenadaDoCep.latitude
      && longitude === this.coordenadaDoCep.longitude;
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
   * Arma e desarma o alvo.
   *
   * Armando, o mapa vem para a tela: o botão fica junto dos campos de
   * coordenada e o mapa costuma estar abaixo da dobra, então sem isso o clique
   * no alvo não mudaria nada do que se vê.
   */
  protected alternarMarcacao(): void {
    // O `disabled` do template já barra o clique; esta guarda existe porque o
    // estado do alvo não pode depender de um atributo do HTML estar certo.
    if (this.alvoIndisponivel()) {
      return;
    }

    const armando = !this.marcandoPonto();
    this.marcandoPonto.set(armando);

    if (armando) {
      this.mapaDoLote().revelar();
    }
  }

  /** Saída pelo Esc. Guardada porque a tecla chega mesmo com o alvo desarmado. */
  protected encerrarMarcacao(): void {
    if (this.marcandoPonto()) {
      this.marcandoPonto.set(false);
    }
  }

  /**
   * Grava no formulário o ponto clicado no mapa e desarma o alvo.
   *
   * Uma captura por clique no botão: enquanto o alvo está armado o mapa deixa
   * de aceitar vértice de contorno, e um modo que ficasse ligado sozinho
   * roubaria o clique seguinte de quem já tinha terminado. Precisou ajustar? É
   * um clique no alvo de novo.
   *
   * Sem `emitEvent: false`: é justamente a reação em cadeia do formulário que
   * move o alfinete do mapa para o ponto novo.
   */
  protected aoMarcarPonto(ponto: Vertice): void {
    this.form.patchValue({ latitude: ponto.latitude, longitude: ponto.longitude });

    // Marcado à mão, o ponto deixa de ser "o que o CEP colocou": uma consulta
    // seguinte passa a preservá-lo em vez de trocá-lo em silêncio.
    this.coordenadaDoCep = null;

    this.marcandoPonto.set(false);
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

    // Fechar o lote desabilita o alvo. Se ele estivesse armado, ficaria armado
    // para sempre — o clique que o desarma é justamente o que o mapa deixou de
    // encaminhar, e o botão que o cancelaria acabou de ficar inerte.
    this.marcandoPonto.set(false);

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
