import { Vertice } from './lote/lote.model';

/**
 * Imóvel como a API devolve — espelha o ImovelResponse do backend.
 * Campos opcionais no domínio chegam como null, não como undefined.
 */
export interface Imovel {
  id: number;
  proprietarioId: number;
  proprietario: string;
  /** CPF de quem é o dono, só com dígitos. Null para cadastro antigo. */
  cpfDoProprietario: string | null;
  municipio: string;
  uf: string;
  bairro: string | null;
  rua: string | null;
  numero: string | null;
  latitude: number;
  longitude: number;
  areaM2: number | null;
  /** Dimensões do lote, em metros. Nulas quando o lote foi desenhado à mão. */
  largura: number | null;
  comprimento: number | null;
  /** Contorno do lote em GeoJSON (WGS 84), ou null. Lido por `verticesDoGeoJson`. */
  poligono: string | null;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Corpo aceito por POST e PUT — espelha o ImovelRequest do backend.
 *
 * Declarado por extenso, e não como `Omit<Imovel, …>`: entrada e saída são dois
 * contratos independentes que hoje quase coincidem. Derivar um do outro faria
 * qualquer campo novo na resposta virar campo obrigatório no envio — o
 * `proprietarioId`, que o POST não aceita, é o exemplo.
 */
export interface ImovelPayload {
  proprietario: string;
  /**
   * CPF do proprietário, com ou sem pontuação.
   *
   * Quando vai preenchido, é **ele** quem identifica a pessoa no servidor: CPF
   * já cadastrado liga o imóvel àquele proprietário em vez de criar outro,
   * mesmo que o nome tenha sido digitado de outro jeito.
   */
  cpfDoProprietario: string | null;
  municipio: string;
  uf: string;
  bairro: string | null;
  rua: string | null;
  numero: string | null;
  latitude: number;
  longitude: number;
  areaM2: number | null;
  /**
   * Largura e comprimento em metros — o atalho para lote retangular. Opcionais,
   * mas indivisíveis: mandar só um dos dois é 400.
   */
  largura: number | null;
  comprimento: number | null;
  /**
   * Contorno desenhado no mapa, em ordem e sem repetir o primeiro no fim.
   *
   * Quando vem preenchido **manda em tudo**: o backend calcula a área a partir
   * dele, reposiciona o ponto do imóvel para dentro do lote e descarta
   * largura/comprimento.
   */
  poligono: Vertice[] | null;
  ativo: boolean;
}
