package br.com.webgis.exception;

import br.com.webgis.model.Proprietario;
import br.com.webgis.service.VerificarSobreposicao;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Traduz excecao em resposta HTTP. Unico ponto do sistema que decide status.
 *
 * Estende ResponseEntityExceptionHandler para que as excecoes padrao do Spring MVC
 * (JSON malformado, tipo de path incompativel, metodo nao suportado) mantenham o
 * status correto em vez de cairem no tratamento generico.
 */
@RestControllerAdvice
public class ManipuladorDeErros extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ManipuladorDeErros.class);

	/** Nome da constraint, recriada na V8. Mudar la exige mudar aqui. */
	private static final String RESTRICAO_DE_SOBREPOSICAO = "uk_imovel_sem_sobreposicao";

	/** Falha de @Valid: 400 com uma mensagem por campo. */
	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
																  HttpHeaders headers,
																  HttpStatusCode status,
																  WebRequest request) {
		ProblemDetail problema = ex.getBody();
		problema.setTitle("Dados inválidos");
		problema.setDetail("Um ou mais campos não passaram na validação.");
		problema.setProperty("erros", agruparPorCampo(ex));

		return handleExceptionInternal(ex, problema, headers, status, request);
	}

	/** Recurso inexistente: 404. */
	@ExceptionHandler(ImovelNaoEncontradoException.class)
	public ProblemDetail imovelNaoEncontrado(ImovelNaoEncontradoException ex) {
		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
		problema.setTitle("Imóvel não encontrado");
		problema.setDetail(ex.getMessage());
		problema.setProperty("idProcurado", ex.getId());
		return problema;
	}

	/** Proprietario inexistente: 404. */
	@ExceptionHandler(ProprietarioNaoEncontradoException.class)
	public ProblemDetail proprietarioNaoEncontrado(ProprietarioNaoEncontradoException ex) {
		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
		problema.setTitle("Proprietário não encontrado");
		problema.setDetail(ex.getMessage());
		problema.setProperty("idProcurado", ex.getId());
		return problema;
	}

	/**
	 * Nome de proprietario ja existente: 409 Conflict.
	 * Nao e 400 — o pedido esta bem formado; o que conflita e o estado atual.
	 */
	@ExceptionHandler(NomeDeProprietarioEmUsoException.class)
	public ProblemDetail nomeEmUso(NomeDeProprietarioEmUsoException ex) {
		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.CONFLICT);
		problema.setTitle("Nome já utilizado");
		problema.setDetail(ex.getMessage());
		return problema;
	}

	/**
	 * Area ja ocupada: 409, pelo mesmo motivo do nome em uso. O id do imovel
	 * conflitante vai na resposta para a tela poder apontar qual e.
	 */
	@ExceptionHandler(AreaSobrepostaException.class)
	public ProblemDetail areaSobreposta(AreaSobrepostaException ex) {
		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.CONFLICT);
		problema.setTitle("Área em conflito");
		problema.setDetail(ex.getMessage());
		problema.setProperty("idDoImovelConflitante", ex.getIdDoImovelConflitante());
		return problema;
	}

	/**
	 * Rede de seguranca da constraint de exclusao do banco.
	 *
	 * O VerificarSobreposicao pega o caso normal; esta aqui pega a corrida em
	 * que duas requisicoes simultaneas veem a area livre e o banco recusa a
	 * segunda no commit. Sem o id do conflitante, que a essa altura so o indice
	 * conhece.
	 *
	 * Qualquer outra violacao de integridade cai no handler generico: violacao
	 * que a aplicacao nao previu e bug, nao erro do usuario.
	 */
	@ExceptionHandler(DataIntegrityViolationException.class)
	public ProblemDetail violacaoDeIntegridade(DataIntegrityViolationException ex) {
		if (!mencionaSobreposicao(ex)) {
			return erroInesperado(ex);
		}

		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.CONFLICT);
		problema.setTitle("Área em conflito");
		problema.setDetail("A área informada conflita com a de outro imóvel já cadastrado.");
		return problema;
	}

	private boolean mencionaSobreposicao(Throwable erro) {
		for (Throwable atual = erro; atual != null; atual = atual.getCause()) {
			String mensagem = atual.getMessage();
			if (mensagem != null && mensagem.contains(RESTRICAO_DE_SOBREPOSICAO)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Invariante de dominio violada: 400.
	 *
	 * Restrito ao tipo proprio do dominio, e nao a IllegalArgumentException:
	 * pegar a excecao generica faria bug de programacao se disfarcar de erro do
	 * usuario. O resto cai no handler generico abaixo, como 500.
	 */
	@ExceptionHandler(DominioInvalidoException.class)
	public ProblemDetail dominioInvalido(DominioInvalidoException ex) {
		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
		problema.setTitle("Dados inválidos");
		problema.setDetail(ex.getMessage());
		return problema;
	}

	/**
	 * Rede de seguranca: qualquer coisa que nao tenha tratamento especifico.
	 * A causa vai para o log com um codigo; a resposta devolve so o codigo.
	 */
	@ExceptionHandler(Exception.class)
	public ProblemDetail erroInesperado(Exception ex) {
		String codigo = UUID.randomUUID().toString();

		log.error("Erro nao tratado [codigo={}]", codigo, ex);

		ProblemDetail problema = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		problema.setTitle("Erro interno");
		problema.setDetail("Ocorreu um erro inesperado. Informe o código abaixo ao suporte.");
		problema.setProperty("codigo", codigo);
		return problema;
	}

	private Map<String, String> agruparPorCampo(MethodArgumentNotValidException ex) {
		Map<String, String> erros = new LinkedHashMap<>();
		for (FieldError erro : ex.getBindingResult().getFieldErrors()) {
			erros.merge(erro.getField(), erro.getDefaultMessage(), (atual, novo) -> atual + "; " + novo);
		}
		return erros;
	}
}
