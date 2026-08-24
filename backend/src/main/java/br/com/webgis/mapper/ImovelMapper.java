package br.com.webgis.mapper;


import br.com.webgis.dto.ImovelRequest;
import br.com.webgis.dto.ImovelResponse;
import br.com.webgis.dto.PontoNoMapaResponse;
import br.com.webgis.model.Coordenada;
import br.com.webgis.model.Dimensoes;
import br.com.webgis.model.Endereco;
import br.com.webgis.model.Imovel;
import br.com.webgis.model.Proprietario;

import java.math.BigDecimal;
import java.util.function.Function;

/**
 * Traducao entre o contrato da API (plano) e o dominio (aninhado).
 * Unico ponto do sistema que conhece as duas formas.
 *
 * O proprietario chega resolvido de fora: o mapper nao tem repositorio, e
 * decidir entre reaproveitar ou criar um proprietario nao e traducao.
 */
public final class ImovelMapper {

	private ImovelMapper() {
	}

	public static Imovel converterParaEntidade(ImovelRequest req, Proprietario proprietario) {
		Imovel imovel = new Imovel(
				proprietario,
				montarEndereco(req),
				montarCoordenada(req),
				req.areaM2(),
				montarDimensoes(req));
		aplicarSituacao(req, imovel);
		return imovel;
	}

	public static void aplicarEm(ImovelRequest req, Imovel imovel, Proprietario proprietario) {
		imovel.atualizarDados(
				proprietario,
				montarEndereco(req),
				montarCoordenada(req),
				req.areaM2(),
				montarDimensoes(req));
		aplicarSituacao(req, imovel);
	}

	public static ImovelResponse converterParaResposta(Imovel imovel) {
		Endereco endereco = imovel.getEndereco();
		Coordenada coordenada = imovel.getCoordenada();
		Proprietario proprietario = imovel.getProprietario();

		return new ImovelResponse(
				imovel.getId(),
				proprietario.getId(),
				proprietario.getNome(),
				proprietario.getCpf(),
				endereco.getCep(),
				endereco.getMunicipio(),
				endereco.getUf(),
				endereco.getBairro(),
				endereco.getRua(),
				endereco.getNumero(),
				coordenada.getLatitude(),
				coordenada.getLongitude(),
				imovel.getAreaM2(),
				dimensao(imovel, Dimensoes::getLargura),
				dimensao(imovel, Dimensoes::getComprimento),
				imovel.getPoligono(),
				imovel.isAtivo(),
				imovel.getCriadoEm(),
				imovel.getAtualizadoEm());
	}

	/** Mesma entidade, contrato menor: o mapa nao le endereco completo nem datas. */
	public static PontoNoMapaResponse converterParaPonto(Imovel imovel) {
		Endereco endereco = imovel.getEndereco();
		Coordenada coordenada = imovel.getCoordenada();

		return new PontoNoMapaResponse(
				imovel.getId(),
				imovel.getProprietario().getNome(),
				endereco.getMunicipio(),
				endereco.getUf(),
				coordenada.getLatitude(),
				coordenada.getLongitude(),
				imovel.getPoligono(),
				imovel.isAtivo());
	}

	/**
	 * Ausencia de dimensoes e' ausencia de geometria, nao erro. Par incompleto
	 * e' erro, e quem reclama e o construtor de Dimensoes: a regra fica no tipo.
	 */
	private static Dimensoes montarDimensoes(ImovelRequest req) {
		if (req.largura() == null && req.comprimento() == null) {
			return null;
		}
		return new Dimensoes(req.largura(), req.comprimento());
	}

	/** Le um lado das dimensoes sem espalhar verificacao de nulo pela montagem. */
	private static BigDecimal dimensao(Imovel imovel, Function<Dimensoes, BigDecimal> lado) {
		Dimensoes dimensoes = imovel.getDimensoes();
		return dimensoes == null ? null : lado.apply(dimensoes);
	}

	private static Endereco montarEndereco(ImovelRequest req) {
		return new Endereco(req.cep(), req.municipio(), req.uf(), req.bairro(), req.rua(), req.numero());
	}

	private static Coordenada montarCoordenada(ImovelRequest req) {
		return new Coordenada(req.latitude(), req.longitude());
	}

	private static void aplicarSituacao(ImovelRequest req, Imovel imovel) {
		if (Boolean.TRUE.equals(req.ativo())) {
			imovel.ativar();
		} else {
			imovel.desativar();
		}
	}
}
