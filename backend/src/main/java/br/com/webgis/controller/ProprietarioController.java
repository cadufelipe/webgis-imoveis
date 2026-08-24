package br.com.webgis.controller;

import br.com.webgis.dto.CpfRequest;
import br.com.webgis.dto.PaginaResponse;
import br.com.webgis.dto.ProprietarioRequest;
import br.com.webgis.dto.ProprietarioResponse;
import br.com.webgis.service.ConsultarProprietarios;
import br.com.webgis.service.IdentificarProprietario;
import br.com.webgis.service.RenomearProprietario;

import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/proprietarios")
public class ProprietarioController {

	private final ConsultarProprietarios consultarProprietarios;
	private final RenomearProprietario renomearProprietario;
	private final IdentificarProprietario identificarProprietario;

	public ProprietarioController(ConsultarProprietarios consultarProprietarios,
								  RenomearProprietario renomearProprietario,
								  IdentificarProprietario identificarProprietario) {
		this.consultarProprietarios = consultarProprietarios;
		this.renomearProprietario = renomearProprietario;
		this.identificarProprietario = identificarProprietario;
	}

	@GetMapping
	public PaginaResponse<ProprietarioResponse> listar(
			@RequestParam(required = false) String nome,
			@PageableDefault(size = 20, sort = "nome", direction = Sort.Direction.ASC) Pageable paginacao) {

		return consultarProprietarios.listar(nome, paginacao);
	}

	/**
	 * Rota propria, e nao um filtro `?cpf=`: a resposta e' um proprietario ou um
	 * 404, e nao uma lista que por acaso tem um item. E' o que o formulario de
	 * imovel consulta para descobrir se o documento digitado ja tem dono.
	 *
	 * Vem declarada antes de /{id} porque e' o par que exige atencao — o Spring
	 * escolhe pela especificidade do padrao, entao /cpf/123 casa aqui e nao no
	 * {id}, onde o Long recusaria "cpf".
	 */
	@GetMapping("/cpf/{cpf}")
	public ProprietarioResponse buscarPorCpf(@PathVariable String cpf) {
		return consultarProprietarios.buscarPorCpf(cpf);
	}

	@GetMapping("/{id}")
	public ProprietarioResponse buscarPorId(@PathVariable Long id) {
		return consultarProprietarios.buscarPorId(id);
	}

	@PutMapping("/{id}")
	public ProprietarioResponse renomear(@PathVariable Long id,
										 @Valid @RequestBody ProprietarioRequest req) {
		return renomearProprietario.executar(id, req);
	}

	/**
	 * Informa o documento de quem foi cadastrado antes de o CPF existir.
	 *
	 * PATCH, e nao PUT: altera um campo de um recurso que continua o mesmo, e o
	 * corpo nao descreve o proprietario inteiro. Rota propria em vez de um campo
	 * no PUT porque as duas operacoes tem consequencias diferentes — renomear
	 * corrige a grafia, identificar decide de quem sao os imoveis.
	 */
	@PatchMapping("/{id}/cpf")
	public ProprietarioResponse identificar(@PathVariable Long id,
											@Valid @RequestBody CpfRequest req) {
		return identificarProprietario.executar(id, req);
	}
}
