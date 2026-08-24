import { Vertice } from '../models/lote.model';

/** Semieixo maior do WGS 84, em metros. */
const RAIO_DA_TERRA = 6378137;

export type UnidadeDeArea = 'm2' | 'ha' | 'alqueire';

interface Unidade {
  readonly rotulo: string;
  readonly sufixo: string;
  readonly emMetrosQuadrados: number;
  readonly casas: number;
}

/**
 * O alqueire aqui é o **paulista**, de 24.200 m². O mineiro tem o dobro, e há
 * outras medidas regionais com o mesmo nome — por isso o rótulo diz qual é, em
 * vez de deixar o usuário supor.
 */
export const UNIDADES: Readonly<Record<UnidadeDeArea, Unidade>> = {
  m2: { rotulo: 'Metros quadrados', sufixo: 'm²', emMetrosQuadrados: 1, casas: 2 },
  ha: { rotulo: 'Hectares', sufixo: 'ha', emMetrosQuadrados: 10_000, casas: 4 },
  alqueire: { rotulo: 'Alqueires (paulista)', sufixo: 'alq.', emMetrosQuadrados: 24_200, casas: 4 },
};

export const UNIDADES_DISPONIVEIS = Object.keys(UNIDADES) as readonly UnidadeDeArea[];

/**
 * Área do polígono em m², pela fórmula do excesso esférico.
 *
 * É uma prévia para quem está desenhando, **não** o valor que vai para o banco:
 * quem calcula o que se grava é o `ST_Area` sobre a geometria projetada em UTM.
 *
 * Os dois não batem, e a diferença não é desprezível: um lote medido em
 * Curitiba deu 3.852,56 m² aqui e 3.835,94 m² no PostGIS — 0,43%. A fórmula
 * trata a Terra como esfera, enquanto o UTM projeta o elipsoide com fator de
 * escala próprio de cada fuso. Zerar essa distância exigiria uma biblioteca de
 * reprojeção no navegador para acertar um número que o servidor vai recalcular
 * de qualquer forma — por isso a tela chama isto de "área do desenho", e o
 * campo de área do formulário só é preenchido depois de salvar.
 */
export function areaEmMetrosQuadrados(vertices: readonly Vertice[]): number {
  if (vertices.length < 3) {
    return 0;
  }

  let soma = 0;

  for (let i = 0; i < vertices.length; i++) {
    const atual = vertices[i];
    const proximo = vertices[(i + 1) % vertices.length];

    soma += (emRadianos(proximo.longitude) - emRadianos(atual.longitude))
      * (2 + Math.sin(emRadianos(atual.latitude)) + Math.sin(emRadianos(proximo.latitude)));
  }

  return Math.abs(soma * RAIO_DA_TERRA * RAIO_DA_TERRA / 2);
}

export function converterDeMetrosQuadrados(area: number, unidade: UnidadeDeArea): number {
  return area / UNIDADES[unidade].emMetrosQuadrados;
}

function emRadianos(graus: number): number {
  return graus * Math.PI / 180;
}
