package br.com.webgis.imovel;

import br.com.webgis.comum.PaginaResponse;
import br.com.webgis.imovel.dto.ImovelFiltro;
import br.com.webgis.imovel.dto.ImovelRequest;
import br.com.webgis.imovel.dto.ImovelResponse;
import br.com.webgis.imovel.dto.MapaResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/imoveis")
public class ImovelController {

	private final ConsultarImoveis consultarImoveis;
	private final CriarImovel criarImovel;
	private final AtualizarImovel atualizarImovel;
	private final ExcluirImovel excluirImovel;

	public ImovelController(ConsultarImoveis consultarImoveis,
							CriarImovel criarImovel,
							AtualizarImovel atualizarImovel,
							ExcluirImovel excluirImovel) {
		this.consultarImoveis = consultarImoveis;
		this.criarImovel = criarImovel;
		this.atualizarImovel = atualizarImovel;
		this.excluirImovel = excluirImovel;
	}

	@GetMapping
	public PaginaResponse<ImovelResponse> listar(
			@RequestParam(required = false) String proprietario,
			@RequestParam(required = false) String municipio,
			@RequestParam(required = false) String uf,
			@RequestParam(required = false) Long proprietarioId,
			@PageableDefault(size = 20, sort = "proprietario.nome", direction = Sort.Direction.ASC) Pageable paginacao) {

		return consultarImoveis.listar(new ImovelFiltro(proprietario, municipio, uf, proprietarioId), paginacao);
	}

	/**
	 * Pontos para o mapa: sem paginacao, com teto no servidor.
	 *
	 * Vem declarado antes de /{id} porque e o par que exige atencao. O Spring
	 * escolhe pela especificidade do padrao, e nao pela ordem dos metodos, entao
	 * /api/imoveis/mapa casa aqui e nao no {id} — se casasse la, o Long nao
	 * aceitaria "mapa" e a rota responderia 400. Ordem no arquivo nao muda o
	 * roteamento, mas deixa a decisao visivel para quem for mexer.
	 *
	 * Os tres parametros repetem os da listagem em vez de virarem um objeto de
	 * binding: escritos por extenso, a assinatura continua sendo a documentacao
	 * da rota.
	 */
	@GetMapping("/mapa")
	public MapaResponse mapa(
			@RequestParam(required = false) String proprietario,
			@RequestParam(required = false) String municipio,
			@RequestParam(required = false) String uf,
			@RequestParam(required = false) Long proprietarioId) {

		return consultarImoveis.mapear(new ImovelFiltro(proprietario, municipio, uf, proprietarioId));
	}

	@GetMapping("/{id}")
	public ImovelResponse buscarPorId(@PathVariable Long id) {
		return consultarImoveis.buscarPorId(id);
	}

	@PostMapping
	public ResponseEntity<ImovelResponse> criar(@Valid @RequestBody ImovelRequest req,
												UriComponentsBuilder uriBuilder) {
		ImovelResponse criado = criarImovel.executar(req);

		URI localizacao = uriBuilder.path("/api/imoveis/{id}")
				.buildAndExpand(criado.id())
				.toUri();

		return ResponseEntity.created(localizacao).body(criado);
	}

	@PutMapping("/{id}")
	public ImovelResponse atualizar(@PathVariable Long id,
									@Valid @RequestBody ImovelRequest req) {
		return atualizarImovel.executar(id, req);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void excluir(@PathVariable Long id) {
		excluirImovel.executar(id);
	}
}
