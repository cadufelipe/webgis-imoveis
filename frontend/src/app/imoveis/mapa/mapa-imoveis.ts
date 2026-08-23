import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit,
  afterNextRender, effect, inject, viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import * as L from 'leaflet';

import { corDaPaleta } from '../../core/cor-da-paleta';
import { ESPERA_DO_FILTRO } from '../../core/interacao';
import { verticesDoGeoJson } from '../lote/lote.model';
import { LocalidadeService } from '../localidade.service';
import { FILTRO_DO_MAPA_VAZIO } from './filtro-do-mapa.model';
import { MapaStore } from './mapa.store';
import { PontoNoMapa } from './mapa.model';

/** Vista inicial quando não há ponto algum. */
const CENTRO_DO_BRASIL: L.LatLngTuple = [-14.235, -51.925];
const ZOOM_DO_PAIS = 4;

/**
 * Sem teto, um único imóvel no resultado leva o fitBounds ao zoom máximo (18) e
 * a tela abre em cima de um telhado, sem referência em volta. 15 mostra o quarteirão.
 */
const ZOOM_MAXIMO_AO_ENQUADRAR = 15;

const FOLGA_DO_ENQUADRAMENTO: L.PointTuple = [32, 32];
const RAIO_DO_PONTO = 6;

/** Baixa de propósito: o lote precisa deixar ver a quadra, a rua e o vizinho. */
const OPACIDADE_DO_LOTE = 0.25;

const ESPESSURA_DA_DIVISA = 2;

const TILES_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const CREDITO_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Fronteira entre o Leaflet, que é imperativo e dono do próprio DOM, e o Angular.
 *
 * **Não há `ngZone.runOutsideAngular` aqui, e isso é deliberado.** É o conselho
 * padrão de todo guia de Angular + Leaflet, porque arrastar e dar zoom
 * disparariam uma detecção de mudanças por quadro. Este app é zoneless e a
 * detecção é movida por signals: não existe zona da qual sair.
 */
@Component({
  selector: 'app-mapa-imoveis',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe],
  templateUrl: './mapa-imoveis.html',
  styleUrl: './mapa-imoveis.scss',
  providers: [MapaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapaImoveis implements OnInit {

  protected readonly store = inject(MapaStore);
  protected readonly localidades = inject(LocalidadeService);

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly recipiente = viewChild.required<ElementRef<HTMLDivElement>>('recipiente');

  private mapa: L.Map | null = null;
  private camadaDePontos: L.LayerGroup | null = null;

  /**
   * Criado uma vez na montagem, e não a cada redesenho: `clearLayers()` remove
   * os marcadores do grupo, mas não o renderizador, que é um layer próprio.
   * Criá-lo dentro do desenharPontos deixava um <canvas> órfão por filtro aplicado.
   */
  private renderizador: L.Canvas | null = null;

  readonly filtroForm = new FormGroup({
    proprietario: new FormControl('', { nonNullable: true }),
    uf: new FormControl('', { nonNullable: true }),
    municipio: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // Mesmo debounce da listagem — e aqui cada requisição pode trazer 500 pontos.
    this.filtroForm.valueChanges
      .pipe(
        debounceTime(ESPERA_DO_FILTRO),
        distinctUntilChanged((anterior, atual) =>
          anterior.proprietario === atual.proprietario
          && anterior.uf === atual.uf
          && anterior.municipio === atual.municipio),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.store.aplicarFiltro(this.filtroForm.getRawValue()));

    // Trocar de estado invalida a cidade escolhida: "Santos" não existe no
    // Paraná, e o par impossível deixaria o mapa vazio sem explicação.
    // `emitEvent: false` porque a própria troca de UF já dispara a busca.
    this.filtroForm.controls.uf.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(sigla => {
        this.filtroForm.controls.municipio.setValue('', { emitEvent: false });

        if (sigla.length > 0) {
          this.localidades.carregarMunicipiosDa(sigla);
          this.filtroForm.controls.municipio.enable({ emitEvent: false });
        } else {
          this.localidades.limparMunicipios();
          this.filtroForm.controls.municipio.disable({ emitEvent: false });
        }
      });

    // Sem estado escolhido não há lista de cidades. Feito aqui, e não com
    // [disabled] no template: em formulário reativo o atributo briga com o
    // estado do FormControl, e o próprio Angular avisa contra.
    this.filtroForm.controls.municipio.disable({ emitEvent: false });

    // O <div> do mapa só existe depois da primeira renderização.
    afterNextRender(() => this.montarMapa());

    // O signal é lido antes da guarda de propósito: é a leitura que registra a
    // dependência. Com a guarda primeiro, o effect não reexecutaria quando os
    // pontos chegassem.
    effect(() => {
      const pontos = this.store.pontos();
      if (this.mapa === null) {
        return; // ainda não montou — quem desenha a primeira vez é o montarMapa
      }
      this.desenharPontos(pontos);
    });

    this.destroyRef.onDestroy(() => {
      // Sem isto, ficam para trás os listeners que o Leaflet registrou no window.
      this.mapa?.remove();
      this.mapa = null;
      this.renderizador = null;
    });
  }

  ngOnInit(): void {
    this.store.carregar();
    this.localidades.carregarUfs();
  }

  limparFiltros(): void {
    this.filtroForm.setValue(FILTRO_DO_MAPA_VAZIO);
  }

  private montarMapa(): void {
    this.mapa = L.map(this.recipiente().nativeElement, {
      center: CENTRO_DO_BRASIL,
      zoom: ZOOM_DO_PAIS,
      // O crédito ao OpenStreetMap é exigência da licença dos tiles, não enfeite.
      attributionControl: true,
    });

    L.tileLayer(TILES_OSM, { attribution: CREDITO_OSM }).addTo(this.mapa);

    // Um único <canvas> para todos os pontos, em vez de um <div> por imóvel:
    // com o teto de 500 do servidor, é a diferença entre 1 nó e 500 no DOM.
    this.renderizador = L.canvas({ padding: 0.5 });
    this.camadaDePontos = L.layerGroup().addTo(this.mapa);

    // Cobre o caso de os pontos terem chegado antes da montagem, quando o
    // effect viu mapa nulo e não desenhou.
    this.desenharPontos(this.store.pontos());
  }

  private desenharPontos(pontos: readonly PontoNoMapa[]): void {
    const mapa = this.mapa;
    const camada = this.camadaDePontos;
    const renderizador = this.renderizador;
    if (mapa === null || camada === null || renderizador === null) {
      return;
    }

    camada.clearLayers();

    // Terracota no ativo, e não o verde da marca: os tiles do OpenStreetMap são
    // beges e verdes, e o verde-petróleo some justamente sobre parque e mata.
    const contorno = corDaPaleta('--cor-superficie', '#fdfcfa');
    const corAtivo = corDaPaleta('--cor-acento', '#b4552f');
    const corInativo = corDaPaleta('--cor-texto-apagado', '#9aa39f');

    const coordenadas: L.LatLngTuple[] = [];

    for (const ponto of pontos) {
      const posicao: L.LatLngTuple = [ponto.latitude, ponto.longitude];
      const cor = ponto.ativo ? corAtivo : corInativo;
      const contornoDoLote = this.contornoDoLote(ponto);

      // Com lote cadastrado — desenhado ou retangular — desenha a área real;
      // sem ele, só o ponto. Enquadrar pelos vértices, e não pelo centro,
      // impede uma borda do lote ficar fora da vista.
      if (contornoDoLote !== null) {
        coordenadas.push(...contornoDoLote);

        L.polygon(contornoDoLote, {
          renderer: renderizador,
          color: cor,
          weight: ESPESSURA_DA_DIVISA,
          fillColor: cor,
          fillOpacity: OPACIDADE_DO_LOTE,
        })
          .bindPopup(() => this.conteudoDoPopup(ponto))
          .addTo(camada);

        continue;
      }

      coordenadas.push(posicao);

      L.circleMarker(posicao, {
        renderer: renderizador,
        radius: RAIO_DO_PONTO,
        color: contorno,
        weight: 2,
        fillColor: cor,
        fillOpacity: 1,
      })
        .bindPopup(() => this.conteudoDoPopup(ponto))
        .addTo(camada);
    }

    this.enquadrar(mapa, coordenadas);
  }

  /**
   * Ajusta a vista ao resultado. Sem isto, filtrar por um município distante
   * deixaria o mapa parado onde estava, aparentemente vazio.
   *
   * `coordenadas` sem `readonly` porque o latLngBounds do Leaflet recusa o tipo
   * readonly, e copiar o array a cada redesenho custaria mais que a garantia.
   */
  private enquadrar(mapa: L.Map, coordenadas: L.LatLngTuple[]): void {
    if (coordenadas.length === 0) {
      mapa.setView(CENTRO_DO_BRASIL, ZOOM_DO_PAIS);
      return;
    }

    mapa.fitBounds(L.latLngBounds(coordenadas), {
      maxZoom: ZOOM_MAXIMO_AO_ENQUADRAR,
      padding: FOLGA_DO_ENQUADRAMENTO,
      // O pan animado do fitBounds roda em requestAnimationFrame. Na carga
      // inicial ele é agendado nos primeiros milissegundos de vida do mapa e,
      // com a aba em segundo plano, o rAF não dispara: o pan nunca completa e
      // os pontos ficam fora da vista, sem erro nenhum no console.
      animate: false,
    });
  }

  /**
   * O contorno na ordem que o Leaflet desenha, ou null sem geometria.
   *
   * Quem lê o GeoJSON — e cuida da inversão de eixos — é o `verticesDoGeoJson`,
   * o mesmo que o formulário de desenho usa. Aqui só sobra a conversão para a
   * tupla do Leaflet.
   */
  private contornoDoLote(ponto: PontoNoMapa): L.LatLngTuple[] | null {
    const vertices = verticesDoGeoJson(ponto.poligono);

    if (vertices === null) {
      return null;
    }

    return vertices.map((vertice): L.LatLngTuple => [vertice.latitude, vertice.longitude]);
  }

  /**
   * Montado em DOM, e não em string de HTML, por duas razões.
   *
   * Segurança: passar HTML ao bindPopup injetaria o nome do proprietário como
   * marcação, e um nome com `<img onerror>` viraria script na tela de quem
   * abrisse o mapa. `textContent` não interpreta marcação.
   *
   * Navegação: uma âncora com href recarregaria a aplicação inteira. O clique
   * chama o Router, que troca de rota mantendo o estado em memória.
   */
  private conteudoDoPopup(ponto: PontoNoMapa): HTMLElement {
    const raiz = document.createElement('div');
    raiz.className = 'popup-imovel';

    const nome = document.createElement('strong');
    nome.textContent = ponto.proprietario;

    const local = document.createElement('div');
    local.textContent = `${ponto.municipio} — ${ponto.uf}`;

    const coordenada = document.createElement('div');
    coordenada.className = 'popup-imovel__coordenada';
    coordenada.textContent = `${ponto.latitude}, ${ponto.longitude}`;

    const forma = document.createElement('div');
    forma.className = 'popup-imovel__coordenada';
    forma.textContent = ponto.poligono === null ? 'Sem área cadastrada' : 'Área do lote';

    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'botao botao--pequeno';
    editar.textContent = 'Editar';
    editar.addEventListener('click', () => {
      void this.router.navigate(['/imoveis', ponto.id, 'editar']);
    });

    raiz.append(nome, local, coordenada, forma, editar);

    if (!ponto.ativo) {
      const inativo = document.createElement('div');
      inativo.className = 'popup-imovel__inativo';
      inativo.textContent = 'Imóvel inativo';
      raiz.insertBefore(inativo, editar);
    }

    return raiz;
  }

}
