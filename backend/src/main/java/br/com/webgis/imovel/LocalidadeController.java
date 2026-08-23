package br.com.webgis.imovel;

import br.com.webgis.imovel.dto.MunicipioResponse;
import br.com.webgis.imovel.dto.UfResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Estados e cidades que existem no cadastro, para alimentar os filtros.
 *
 * Rota propria em vez de `/api/imoveis/localidades`: o que se pede aqui nao e'
 * imovel, e' o vocabulario com que se procura imovel — amarrar ao caminho de
 * imoveis sugeriria uma subcolecao que nao existe.
 *
 * O aninhamento `/ufs/{uf}/municipios` diz o que o dado e': municipio so existe
 * dentro de uma UF, e e' o que permite carregar as cidades sob demanda.
 */
@RestController
@RequestMapping("/api/localidades")
public class LocalidadeController {

	private final ConsultarLocalidades consultarLocalidades;

	public LocalidadeController(ConsultarLocalidades consultarLocalidades) {
		this.consultarLocalidades = consultarLocalidades;
	}

	@GetMapping("/ufs")
	public List<UfResponse> ufs() {
		return consultarLocalidades.ufs();
	}

	@GetMapping("/ufs/{uf}/municipios")
	public List<MunicipioResponse> municipios(@PathVariable String uf) {
		return consultarLocalidades.municipiosDa(uf);
	}
}
