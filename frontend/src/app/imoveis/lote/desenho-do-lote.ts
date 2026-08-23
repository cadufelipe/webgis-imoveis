import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef,
  afterNextRender, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import * as L from 'leaflet';

import { corDaPaleta } from '../../core/cor-da-paleta';
import { UNIDADES, UNIDADES_DISPONIVEIS, UnidadeDeArea, areaEmMetrosQuadrados, converterDeMetrosQuadrados } from './area-do-lote';
import { Vertice } from './lote.model';

/** Vista inicial quando o formulário ainda não tem coordenada nenhuma. */
const CENTRO_DO_BRASIL: L.LatLngTuple = [-14.235, -51.925];
const ZOOM_DO_PAIS = 4;

/** Zoom em que um lote urbano cabe na tela com a quadra em volta. */
const ZOOM_DO_LOTE = 18;

const MINIMO_DE_VERTICES = 3;

/** Mesma precisao da coluna NUMERIC(10,7) do banco: ~1 cm. */
const CASAS_DA_COORDENADA = 7;
const RAIO_DO_VERTICE = 6;

const TILES_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const CREDITO_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Desenha o lote no mapa, vértice a vértice.
 *
 * Não conhece formulário nem HTTP: recebe um polígono para editar e emite a
 * lista de vértices quando ela vira um lote fechado — ou `null` enquanto o
 * desenho está incompleto, que é o que impede salvar meia figura.
 */
@Component({
  selector: 'app-desenho-do-lote',
  imports: [DecimalPipe],
  templateUrl: './desenho-do-lote.html',
  styleUrl: './desenho-do-lote.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesenhoDoLote {

  /** Lote já salvo, na edição. Nulo no cadastro. */
  readonly inicial = input<Vertice[] | null>(null);

  /** Coordenada digitada no formulário: a vista inicial, e o alvo do "Centralizar aqui". */
  readonly centro = input<Vertice | null>(null);

  readonly alterado = output<Vertice[] | null>();

  protected readonly vertices = signal<readonly Vertice[]>([]);
  protected readonly fechado = signal(false);
  protected readonly unidade = signal<UnidadeDeArea>('m2');

  /**
   * Trava a carga do lote salvo assim que o usuário encosta no desenho.
   *
   * Sem ela, apagar o contorno com "Limpar" faz o desenho voltar sozinho: o
   * efeito de carga observa os vértices, vê a lista vazia e repõe o polígono
   * que veio do servidor. O lote reaparecia na tela enquanto o formulário já
   * considerava o desenho removido.
   */
  private readonly tocado = signal(false);

  protected readonly opcoesDeUnidade = UNIDADES_DISPONIVEIS
    .map(id => ({ id, rotulo: UNIDADES[id].rotulo }));

  protected readonly sufixoDaUnidade = computed(() => UNIDADES[this.unidade()].sufixo);

  /** Hectare e alqueire precisam de mais casas: 300 m² são 0,03 ha. */
  protected readonly formatoDaArea = computed(() => `1.0-${UNIDADES[this.unidade()].casas}`);

  protected readonly podeFechar = computed(() =>
    !this.fechado() && this.vertices().length >= MINIMO_DE_VERTICES);

  /**
   * Os vértices como texto, para a lista de pontos.
   *
   * Com **ponto decimal**, e não pela vírgula do `DecimalPipe` em pt-BR:
   * coordenada é notação técnica, é assim que ela aparece no popup do mapa e
   * nos campos de latitude e longitude, e é assim que precisa sair daqui para
   * ser colada em qualquer outra ferramenta.
   */
  protected readonly pontos = computed(() => this.vertices().map(vertice => ({
    latitude: vertice.latitude.toFixed(CASAS_DA_COORDENADA),
    longitude: vertice.longitude.toFixed(CASAS_DA_COORDENADA),
  })));

  /**
   * A área do desenho em andamento também é mostrada: com três vértices ou mais
   * ela já tem significado, e ver o número mudar enquanto se arrasta é o que
   * permite ajustar antes de fechar.
   */
  protected readonly area = computed(() =>
    converterDeMetrosQuadrados(areaEmMetrosQuadrados(this.vertices()), this.unidade()));

  private readonly recipiente = viewChild.required<ElementRef<HTMLDivElement>>('recipiente');
  private readonly destroyRef = inject(DestroyRef);

  private mapa: L.Map | null = null;
  private camada: L.LayerGroup | null = null;

  constructor() {
    // O lote salvo chega depois da primeira renderização, porque a edição busca
    // o imóvel. Carrega uma vez só, e nunca por cima do que o usuário fez.
    effect(() => {
      const inicial = this.inicial();

      if (inicial === null || inicial.length === 0 || this.tocado()) {
        return;
      }

      this.vertices.set(inicial);
      this.fechado.set(true);
      this.enquadrar();
    });

    afterNextRender(() => this.montarMapa());

    effect(() => {
      this.vertices();
      this.fechado();
      this.redesenhar();
    });

    this.destroyRef.onDestroy(() => {
      this.mapa?.remove();
      this.mapa = null;
    });
  }

  protected escolherUnidade(evento: Event): void {
    this.unidade.set((evento.target as HTMLSelectElement).value as UnidadeDeArea);
  }

  /**
   * Leva o mapa até a coordenada digitada no formulário.
   *
   * É um botão, e não um `setView` automático a cada mudança do input: a
   * latitude é digitada dígito a dígito, e "-2" é uma coordenada válida no meio
   * do Atlântico. O mapa saltaria para lá antes de o número terminar.
   */
  protected centralizar(): void {
    const centro = this.centro();

    if (this.mapa === null || centro === null) {
      return;
    }

    this.mapa.setView([centro.latitude, centro.longitude], ZOOM_DO_LOTE, { animate: false });
  }

  protected fechar(): void {
    if (!this.podeFechar()) {
      return;
    }
    this.tocado.set(true);
    this.fechado.set(true);
    this.notificar();
  }

  protected desfazer(): void {
    this.tocado.set(true);
    this.vertices.update(atuais => atuais.slice(0, -1));
    this.fechado.set(false);
    this.notificar();
  }

  protected limpar(): void {
    this.tocado.set(true);
    this.vertices.set([]);
    this.fechado.set(false);
    this.notificar();
  }

  /** Reabre para acrescentar vértices a um lote já fechado. */
  protected editar(): void {
    this.tocado.set(true);
    this.fechado.set(false);
    this.notificar();
  }

  private montarMapa(): void {
    const centro = this.centro();
    const inicial = this.inicial();

    this.mapa = L.map(this.recipiente().nativeElement, {
      center: centro === null ? CENTRO_DO_BRASIL : [centro.latitude, centro.longitude],
      zoom: centro === null ? ZOOM_DO_PAIS : ZOOM_DO_LOTE,
      attributionControl: true,
    });

    L.tileLayer(TILES_OSM, { attribution: CREDITO_OSM }).addTo(this.mapa);

    this.mapa.on('click', evento => this.aoClicarNoMapa(evento.latlng));

    this.camada = L.layerGroup().addTo(this.mapa);

    if (inicial !== null && inicial.length > 0) {
      this.enquadrar();
    }

    this.redesenhar();
  }

  /**
   * Clique em lote fechado não acrescenta vértice: quem já terminou o desenho
   * costuma clicar no mapa para arrastar, e um vértice novo aparecendo do nada
   * quebraria a forma sem que ninguém tenha pedido.
   */
  private aoClicarNoMapa(posicao: L.LatLng): void {
    if (this.fechado()) {
      return;
    }

    this.tocado.set(true);
    this.vertices.update(atuais => [...atuais, {
      latitude: Number(posicao.lat.toFixed(CASAS_DA_COORDENADA)),
      longitude: Number(posicao.lng.toFixed(CASAS_DA_COORDENADA)),
    }]);

    this.notificar();
  }

  private redesenhar(): void {
    const camada = this.camada;
    if (camada === null) {
      return;
    }

    camada.clearLayers();

    const vertices = this.vertices();
    const posicoes = vertices.map((v): L.LatLngTuple => [v.latitude, v.longitude]);
    const cor = corDaPaleta('--cor-acento', '#b4552f');
    const contorno = corDaPaleta('--cor-superficie', '#fdfcfa');

    if (this.fechado() && posicoes.length >= MINIMO_DE_VERTICES) {
      L.polygon(posicoes, { color: cor, weight: 2, fillColor: cor, fillOpacity: 0.25 }).addTo(camada);
    } else if (posicoes.length > 1) {
      L.polyline(posicoes, { color: cor, weight: 2, dashArray: '6 4' }).addTo(camada);
    }

    posicoes.forEach((posicao, indice) => {
      const marcador = L.circleMarker(posicao, {
        radius: RAIO_DO_VERTICE,
        color: contorno,
        weight: 2,
        fillColor: cor,
        fillOpacity: 1,
      }).addTo(camada);

      // Clicar no primeiro vértice fecha o contorno — o gesto que todo editor
      // de mapa usa. O botão ao lado faz o mesmo, para quem não descobrir.
      if (indice === 0) {
        marcador.on('click', evento => {
          L.DomEvent.stop(evento);
          this.fechar();
        });
      }
    });
  }

  private enquadrar(): void {
    const posicoes = this.vertices().map((v): L.LatLngTuple => [v.latitude, v.longitude]);

    if (this.mapa === null || posicoes.length === 0) {
      return;
    }

    this.mapa.fitBounds(L.latLngBounds(posicoes), { padding: [24, 24], animate: false });
  }

  /** Lote incompleto vale `null`: é o que impede o formulário de enviar meia figura. */
  private notificar(): void {
    const vertices = this.vertices();
    this.alterado.emit(this.fechado() && vertices.length >= MINIMO_DE_VERTICES ? [...vertices] : null);
  }
}
