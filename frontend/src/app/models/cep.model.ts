/** Endereço que a consulta de CEP devolveu, já traduzido para o vocabulário do sistema. */
export interface EnderecoDoCep {
  cep: string;
  uf: string;
  municipio: string;
  bairro: string | null;
  rua: string | null;
  /** Coordenada aproximada da via. Nem todo CEP tem — depende da base que respondeu. */
  latitude: number | null;
  longitude: number | null;
}

/**
 * Resposta crua da BrasilAPI (`/api/cep/v2/{cep}`), em inglês e com a
 * coordenada como texto dentro de um GeoJSON parcial.
 *
 * Declarada aqui, e não usada fora do serviço, porque é contrato de terceiro:
 * o resto da aplicação fala `EnderecoDoCep`, e uma mudança lá do outro lado
 * para de vazar em um arquivo só.
 */
export interface RespostaDaBrasilApi {
  cep: string;
  state: string;
  city: string;
  neighborhood?: string | null;
  street?: string | null;
  location?: {
    coordinates?: {
      latitude?: string | null;
      longitude?: string | null;
    } | null;
  } | null;
}

/** Só os dígitos: o usuário digita com hífen, ponto ou espaço, e a API não aceita nada disso. */
export function apenasDigitos(cep: string): string {
  return cep.replace(/\D/g, '');
}

export const TAMANHO_DO_CEP = 8;
