package br.com.webgis.imovel;

import br.com.webgis.imovel.dto.ImovelRequest;
import br.com.webgis.imovel.dto.ImovelResponse;
import br.com.webgis.proprietario.Proprietario;
import br.com.webgis.proprietario.ResolverProprietario;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AtualizarImovel {

	private final ImovelRepository repository;
	private final ResolverProprietario resolverProprietario;
	private final VerificarSobreposicao verificarSobreposicao;
	private final GravarGeometriaDoLote gravarGeometriaDoLote;

	public AtualizarImovel(ImovelRepository repository,
						   ResolverProprietario resolverProprietario,
						   VerificarSobreposicao verificarSobreposicao,
						   GravarGeometriaDoLote gravarGeometriaDoLote) {
		this.repository = repository;
		this.resolverProprietario = resolverProprietario;
		this.verificarSobreposicao = verificarSobreposicao;
		this.gravarGeometriaDoLote = gravarGeometriaDoLote;
	}

	@Transactional
	public ImovelResponse executar(Long id, ImovelRequest req) {
		Imovel imovel = repository.findById(id)
				.orElseThrow(() -> new ImovelNaoEncontradoException(id));

		// Ignora o proprio imovel: ele sempre se sobrepoe a si mesmo.
		verificarSobreposicao.garantirAreaLivre(req, id);

		Proprietario proprietario = resolverProprietario.resolver(req.proprietario(), req.cpfDoProprietario());
		ImovelMapper.aplicarEm(req, imovel, proprietario);

		// O @UpdateTimestamp so e preenchido no flush. Sem este flush explicito,
		// a resposta devolveria o atualizadoEm anterior a edicao.
		repository.flush();

		// Depois do flush: a geometria e' escrita em SQL nativo, e a linha
		// precisa ja estar com os dados novos quando o UPDATE dela roda.
		gravarGeometriaDoLote.aplicarEm(imovel, req);

		return ImovelMapper.converterParaResposta(imovel);
	}
}
