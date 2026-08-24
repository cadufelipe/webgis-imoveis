package br.com.webgis.service;

import br.com.webgis.dto.ImovelRequest;
import br.com.webgis.dto.ImovelResponse;
import br.com.webgis.mapper.ImovelMapper;
import br.com.webgis.model.Imovel;
import br.com.webgis.model.Proprietario;
import br.com.webgis.repository.ImovelRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CriarImovel {

	private final ImovelRepository repository;
	private final ResolverProprietario resolverProprietario;
	private final VerificarSobreposicao verificarSobreposicao;
	private final GravarGeometriaDoLote gravarGeometriaDoLote;

	public CriarImovel(ImovelRepository repository,
					   ResolverProprietario resolverProprietario,
					   VerificarSobreposicao verificarSobreposicao,
					   GravarGeometriaDoLote gravarGeometriaDoLote) {
		this.repository = repository;
		this.resolverProprietario = resolverProprietario;
		this.verificarSobreposicao = verificarSobreposicao;
		this.gravarGeometriaDoLote = gravarGeometriaDoLote;
	}

	@Transactional
	public ImovelResponse executar(ImovelRequest req) {
		// Antes de qualquer escrita: area ocupada e' recusa, nao correcao.
		verificarSobreposicao.garantirAreaLivre(req, null);

		Proprietario proprietario = resolverProprietario.resolver(req.proprietario(), req.cpfDoProprietario());
		Imovel imovel = ImovelMapper.converterParaEntidade(req, proprietario);

		// O save primeiro, porque a geometria e' gravada por id.
		Imovel salvo = repository.save(imovel);
		gravarGeometriaDoLote.aplicarEm(salvo, req);

		return ImovelMapper.converterParaResposta(salvo);
	}
}
