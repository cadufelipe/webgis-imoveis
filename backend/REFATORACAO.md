# Refatoração do backend

Registro das mudanças feitas no backend, na ordem em que foram aplicadas, com a
justificativa de cada decisão.

**Stack:** Java 21 · Spring Boot 3.5.16 · Spring Data JPA · Flyway 11.7.2 · PostgreSQL 17

---

## Sumário do diagnóstico

O código original funcionava, mas concentrava cinco problemas graves em um único
arquivo (`ImovelService`):

| # | Problema | Gravidade |
|---|---|---|
| 1 | SQL montado por concatenação de string — **SQL injection** em todos os endpoints | 🔴 |
| 2 | `Object` como tipo de entrada e saída em toda a API — nenhum contrato | 🔴 |
| 3 | Entidade JPA mapeada e **nunca usada**; acesso via `EntityManager` + query nativa | 🔴 |
| 4 | Exceção capturada e descartada (`return null`) — falha virava `HTTP 200` | 🔴 |
| 5 | `@CrossOrigin(origins = "*")` fixo no controller | 🔴 |
| 6 | Sem validação de entrada, sem DTO, sem camada de repositório | 🟠 |
| 7 | `System.out.println` como log, campos públicos na entidade, coleções sem generics | 🟠 |
| 8 | `ddl-auto=update` + `data.sql` reexecutado a cada boot (dados duplicavam) | 🟠 |

A ordem de correção foi escolhida para que **os itens 1, 2, 3 e 6 caíssem juntos**:
todos decorrem da ausência de repositório e DTO, então atacar a raiz resolveu
também os sintomas (índices mágicos, coleções cruas, `id` como `String`).

---

## Ordem das mudanças

| # | Arquivo | Ação |
|---|---|---|
| 1 | `Coordenada`, `Endereco`, `Imovel` | modelo de domínio rico, sem setters |
| 2 | `ImovelRepository` | novo — Spring Data JPA |
| 3 | `dto/ImovelRequest` | novo — contrato de entrada + validação |
| 4 | `dto/ImovelResponse` | novo — contrato de saída |
| 5 | `ImovelMapper` | novo — tradução API ↔ domínio |
| 6 | `ImovelNaoEncontradoException` | nova — exceção de domínio |
| 7 | `ImovelService` → 4 casos de uso | **deletado**; substituído |
| 8 | `ImovelController` | reescrito — tipos concretos e status HTTP |
| 9 | `web/ManipuladorDeErros` | novo — tradução exceção → resposta |
| 10 | `web/CorsConfig` | novo — CORS central e configurável |
| 11 | Flyway (`V1`, `V2`) + `ddl-auto=validate` | schema versionado; `data.sql` removido |
| 12 | `ImovelFiltro`, `PaginaResponse`, `ImovelSpecs` | filtros e paginação (tarefas 2 e 6) |
| 13 | `V3__busca_por_texto_sem_acento.sql` | busca sem acento + índices GIN de trigrama |
| 14 | `V4` + pacote `proprietario` | proprietário como entidade (tarefas 4 e 5) |

---

## 1. Modelo de domínio — `Imovel`, `Endereco`, `Coordenada`

**Antes:** 13 campos `public`, sem construtor, sem invariante. Qualquer código
alterava qualquer estado.

**Depois:** campos privados, **sem setters**, com operações de negócio nomeadas
(`atualizarDados`, `ativar`, `desativar`) e construtor que valida.

### Por que Tell, Don't Ask

Com `@Setter` gerado em bloco, a regra de atualização vivia em quem chamava — o
objeto era um saco de dados. Agora o `Imovel` protege o próprio estado: ou ele
nasce válido, ou não nasce.

### Por que os value objects

Sem setters, `atualizarDados` precisaria de **10 parâmetros** — sinal de que
faltavam conceitos no modelo. `Endereco` (município, UF, bairro, rua, número) e
`Coordenada` (latitude, longitude) reduzem a assinatura para 4 e trazem três
ganhos:

- **Invariante no tipo** — "latitude entre -90 e 90" mora dentro de `Coordenada`.
  Não existe caminho no sistema (API, script, importação) que produza uma
  coordenada inválida.
- **Segurança na assinatura** — `Endereco` e `Coordenada` são tipos distintos;
  trocá-los de posição vira erro de compilação. Com 10 `String`/`BigDecimal`
  soltos, trocar `bairro` com `rua` compilava em silêncio.
- **Coesão** — latitude sozinha não significa nada; o par significa.

`@Embedded` grava nas **mesmas colunas da mesma tabela** — a refatoração é
puramente do modelo Java, o banco não mudou.

### Outras decisões

- `@CreationTimestamp` / `@UpdateTimestamp` no lugar do `now()` escrito à mão em
  dois métodos. `updatable = false` no `criado_em` torna impossível um `PUT`
  reescrever a data de criação.
- **Sem `@Data` / `@EqualsAndHashCode`** — em entidade JPA, `equals` baseado em
  todos os campos quebra quando o `id` é gerado pelo banco: o objeto muda de
  `hashCode` depois do `save` e some de um `HashSet`.
- Construtor `protected` vazio, exigido pelo Hibernate, fora do alcance da
  aplicação.

---

## 2. `ImovelRepository`

Interface de 11 linhas, sem implementação — o Spring Data gera o proxy em runtime.

**É este arquivo que fecha a SQL injection:** todo método gerado usa
`PreparedStatement` com parâmetro vinculado, então valor e comando trafegam em
canais separados.

> Vale registrar: **a validação do DTO não protegeria contra injeção.** Uma string
> maliciosa de 30 caracteres passa por `@NotBlank` e `@Size(max=120)` sem
> reclamar. Quem neutraliza é a parametrização, não a validação.

Na primeira versão o repositório declarava `findAllByOrderByProprietarioAsc()`.
Ele foi **removido no passo 12**: com filtros e paginação, a ordenação passou a
vir do `Pageable`, e manter o método seria código morto. O repositório hoje só
estende `JpaRepository` e `JpaSpecificationExecutor` — não declara nenhuma
consulta própria.

O `sort` padrão é `proprietario.nome` desde o passo 14, quando o proprietário
virou entidade: o Spring Data cria o join pela associação a partir desse caminho.

---

## 3 e 4. DTOs — `ImovelRequest` e `ImovelResponse`

Dois `record`, imutáveis, um por direção.

### Por que dois e não um

Entrada e saída **não têm os mesmos campos**. `id`, `criadoEm` e `atualizadoEm`
são do servidor: como o `ImovelRequest` não tem componente para recebê-los, um
cliente que os envie tem os valores descartados. É *mass assignment* bloqueado
pela estrutura do tipo, não por uma checagem que alguém pode esquecer de escrever.

### Por que o contrato ficou plano

O domínio é aninhado (`endereco.municipio`), mas o JSON continua plano
(`"municipio"`). Isso é o DTO cumprindo sua função: o domínio ganhou value
objects **sem o frontend saber**. Se a entidade fosse exposta direto, a
refatoração do passo 1 teria quebrado a aplicação Angular.

### Validação em duas camadas — não é duplicação

| Onde | Papel | Se remover |
|---|---|---|
| `ImovelRequest` | `400` com mensagem por campo; usabilidade da API | clientes externos mandam lixo |
| `Endereco` / `Coordenada` | integridade do dado, venha de onde vier | script ou job corrompe a base |

O DTO acumula todos os erros e responde de uma vez; o value object falha no
primeiro. Alcances diferentes.

---

## 5. `ImovelMapper`

Único ponto do sistema que conhece as duas formas. Classe `final`,
package-private, com métodos estáticos — não é bean do Spring porque não tem
estado nem dependência.

Duas direções de escrita, e elas **não podem ser unificadas**:

- `converterParaEntidade` (POST) cria instância nova.
- `aplicarEm` (PUT) muta a entidade **já gerenciada** pelo Hibernate. Construir
  um objeto novo perderia o `id` e o `criadoEm`, e ele estaria *detached* — a
  alteração nunca seria gravada.

**Risco residual reconhecido:** `new ImovelResponse(...)` recebe 13 argumentos
posicionais, e `getLatitude()` / `getLongitude()` são vizinhos do mesmo tipo.
Trocá-los compila em silêncio — a mesma falha que o `linha[7]` / `linha[8]` do
código original tinha. Melhorou bastante (nomes visíveis na chamada, tipos e
quantidade conferidos pelo compilador, erro confinado a uma linha de um arquivo),
mas imune não é. O que fecha isso é um teste. MapStruct resolveria gerando o
código, mas a dependência não se paga com uma entidade só.

---

## 6 a 8. Casos de uso e controller

`ImovelService` (134 linhas, 5 responsabilidades) foi substituído por quatro
classes de ~25 linhas: `CriarImovel`, `AtualizarImovel`, `ExcluirImovel` e
`ConsultarImoveis`.

**Não houve ganho em número de linhas** (134 → 104). O ganho é que cada classe
tem um motivo para mudar, e nenhuma contém SQL.

`ConsultarImoveis` agrupa as duas leituras e foge do padrão de comando de
propósito: consulta não altera estado nem tem invariante a proteger — uma classe
por query seria cerimônia sem ganho.

### Decisões relevantes

- **Injeção por construtor com campo `final`** — permite `new CriarImovel(repositorioFalso)`
  em teste unitário, sem subir o contexto do Spring.
- **`@Transactional(readOnly = true)`** nas consultas: o Hibernate pula o
  *dirty checking* e o driver não abre transação de escrita.
- **`AtualizarImovel` não chama `save()`** — dentro da transação, o Hibernate
  detecta a alteração e emite o `UPDATE` sozinho (*dirty checking*).
- **`ExcluirImovel` verifica antes de apagar** — a partir do Spring Data 3.0,
  `deleteById` de id inexistente é silencioso. Sem a checagem, `DELETE /99999`
  responderia `204` como se tivesse apagado algo. O custo é uma consulta a mais;
  o benefício é um `404` honesto.
- **Nenhum `try/catch`** — os casos de uso não sabem se recuperar de falha de
  banco. Capturar sem saber tratar apaga informação, e era o que transformava
  erro em `HTTP 200`.
- **Status HTTP reais**: `201 Created` + header `Location` no POST, `204 No Content`
  no DELETE, `404` para id inexistente. O `{"status":"ok"}` anterior reinventava
  o que o protocolo já expressa — e não devolvia nem o id do recurso criado.

### Correção aplicada durante os testes

A resposta do `PUT` devolvia `atualizadoEm` desatualizado: o `@UpdateTimestamp`
só é preenchido no *flush*, que acontece no fim da transação — depois de a
resposta ter sido montada. O banco sempre esteve correto; a resposta é que
mentia. Resolvido com `repository.flush()` explícito antes do mapeamento.

---

## 9. `ManipuladorDeErros`

`@RestControllerAdvice` que estende **`ResponseEntityExceptionHandler`**.

### A armadilha do handler genérico

Um `@ExceptionHandler(Exception.class)` solto captura também as exceções que o
Spring já traduzia corretamente:

| Requisição | Sem o `extends` | Com o `extends` |
|---|---|---|
| JSON malformado | ~~500~~ | `400` |
| `GET /api/imoveis/abc` | ~~500~~ | `400` |
| Método não suportado | ~~500~~ | `405` |

Estendendo a classe do Spring, essas exceções mantêm seus handlers específicos, e
o genérico só pega o que sobra — que é o que "genérico" deve significar.

### Quatro tratamentos

1. **Validação** → `400` com uma mensagem por campo. Usa `merge` em vez de `put`
   para não descartar a segunda mensagem quando um campo viola duas regras.
2. **`ImovelNaoEncontradoException`** → `404`.
3. **`IllegalArgumentException`** → `400` (invariantes dos value objects).
4. **`Exception`** → `500` com **código de correlação**: a stack trace vai para o
   log com um UUID, e a resposta devolve **só o UUID**.

**Por que a resposta não contém `ex.getMessage()`:** mensagem de exceção vaza
estrutura interna — nome de tabela, host de banco, caminho de arquivo. O usuário
recebe o mínimo, o operador recebe o máximo, e o elo entre os dois é um UUID que
não revela nada.

**Por que a exceção de domínio não tem `@ResponseStatus`:** ela vive no pacote
`imovel` e faz sentido em qualquer contexto — job noturno, consumidor de fila,
script de importação. Nenhum deles fala HTTP. A associação "não encontrado ⇒ 404"
é conhecimento da camada web, e é lá que ela mora.

**Concessão registrada:** mapear `IllegalArgumentException` para `400` faz um bug
de programação ser reportado como erro do cliente. Aceitável enquanto as únicas
fontes dessa exceção são os três value objects; quando o código crescer, o
correto é criar uma `DadoInvalidoException` própria e deixar
`IllegalArgumentException` cair no genérico.

O formato de resposta é **`ProblemDetail` (RFC 7807)**, nativo no Spring 6 —
entendido por qualquer cliente sem documentação extra.

---

## 10. `CorsConfig`

`@CrossOrigin(origins = "*")` saiu do controller e virou `WebMvcConfigurer` com
origens vindas de propriedade:

```properties
webgis.cors.origens-permitidas=http://localhost:4200
```

CORS é preocupação transversal de infraestrutura, não regra de um endpoint. E
cada ambiente define a sua origem sem recompilar.

---

## 11. Flyway — schema como código versionado

**Problema original:** `spring.sql.init.mode=always` reexecutava o `data.sql` a
cada subida. Depois de seis boots o banco tinha **72 registros — 6 cópias de cada
uma das 12 linhas do seed**.

**Solução final:** duas migrations, executadas exatamente uma vez cada e
registradas em `flyway_schema_history`.

| Arquivo | Conteúdo |
|---|---|
| `V1__criar_tabela_imovel.sql` | schema + índice em `proprietario` |
| `V2__carga_inicial_de_imoveis.sql` | os 12 imóveis de exemplo |

A idempotência deixou de ser responsabilidade de quem escreve o SQL e passou a
ser garantia da ferramenta.

`spring.jpa.hibernate.ddl-auto` foi de `update` para **`validate`**: o Hibernate
perde a permissão de alterar o banco e apenas confere se o schema bate com as
entidades. Adicionar um campo sem escrever a migration passa a **impedir a
subida**, em vez de o schema mudar sozinho em um ambiente e não em outro.

> `flyway-database-postgresql` é dependência obrigatória além do `flyway-core`:
> desde o Flyway 10 o suporte a cada banco foi separado do núcleo. Sem ela o erro
> é `No database found to handle jdbc:postgresql://...`.

**Nota de migração:** a tabela existente havia sido criada pelo Hibernate, e o
Flyway se recusa a rodar sobre schema povoado sem histórico. Optou-se por
derrubar a tabela e reconstruí-la pelas migrations, em vez de usar
`baseline-on-migrate=true` — que adotaria o schema inferido pelo Hibernate sem
nunca tê-lo versionado, mantendo justamente o problema que se queria resolver.

---

## 12 e 13. Filtros e paginação (tarefas 2 e 6)

`GET /api/imoveis` passou a aceitar `?proprietario=`, `?municipio=`, `?page=`,
`?size=` e a devolver um envelope paginado. **É uma quebra de contrato
deliberada** — a alternativa seria manter um endpoint que não se sustenta em
volume real.

### `PaginaResponse` em vez do `Page` do Spring

O JSON do `PageImpl` é detalhe interno da biblioteca, muda entre versões, e o
próprio Spring Boot 3.3+ emite alerta contra serializá-lo. O envelope próprio
mantém o contrato sob nosso controle:

```json
{ "conteudo": [...], "pagina": 0, "tamanho": 20, "totalDeItens": 12,
  "totalDePaginas": 1, "primeira": true, "ultima": true }
```

### `Specification` em vez de query derivada

`findByProprietarioContainingIgnoreCase...` funcionaria, mas forçaria
`LIKE '%%'` quando o filtro estivesse vazio. Com `Specification`, **filtro
ausente não vira predicado** — o SQL gerado não carrega condição inútil.

O custo é perder segurança de tipos: `raiz.get("proprietario")` é string. O
metamodel do JPA resolveria, ao preço de um processador de anotação a mais.

Detalhe: o caminho do município passa pelo value object —
`raiz.get("endereco").get("municipio")`.

### Teto de tamanho de página

```properties
spring.data.web.pageable.max-page-size=100
```

Sem isso, `?size=999999` faria o servidor materializar a tabela inteira em
memória — paginação que pode ser desligada pelo cliente não é proteção.

### Busca sem acento (`V3`)

Defeito encontrado testando: `?municipio=sao` **não** encontrava "São Paulo".
Num cadastro de endereços brasileiros isso é inaceitável — ninguém digita acento
em campo de busca.

A correção tem dois lados que precisam combinar:

- **No banco:** função `sem_acento()` (wrapper `IMMUTABLE` sobre `unaccent`, com
  o dicionário fixado na forma de dois argumentos — sem isso ela não é indexável).
- **Em Java:** `ImovelFiltro` normaliza o termo com `Normalizer.NFD` e remove os
  diacríticos, para o termo buscado chegar na mesma forma da coluna.

E os índices:

```sql
CREATE INDEX ... USING gin (sem_acento(proprietario) gin_trgm_ops);
```

**GIN com trigramas é o único tipo que atende `LIKE '%termo%'`.** Um B-tree comum
só serve para prefixo (`'termo%'`), inútil para busca parcial.

---

## Medição de desempenho (tarefa 6)

Método: 200.000 imóveis gerados via `generate_series`, `ANALYZE` na tabela e
`EXPLAIN (ANALYZE, BUFFERS)` em cada cenário. O "sem índice" foi obtido com
`SET enable_indexscan/enable_bitmapscan = off`, para comparar sem alterar o
schema. Dados de teste removidos ao final.

| Cenário | Com índice | Sem índice |
|---|---|---|
| Filtro seletivo (112 de 200 mil) | **11 ms** | 184 ms |
| Filtro pouco seletivo (20 mil) + `LIMIT 20` | 2 ms | 290 ms |
| `COUNT(*)` do total filtrado | **68 ms** | — |
| Página 1 (`OFFSET 0`) | 0,09 ms | — |
| Página 9000 (`OFFSET 180000`) | **44,8 ms** | — |

### O que os números mostraram — inclusive o que contrariou a expectativa

**1. O índice de trigrama vale 17× em filtro seletivo.** É o ganho real, e é o
caso comum: o usuário digita um nome específico.

**2. Em filtro pouco seletivo, o índice de trigrama não é usado.** O planejador
prefere percorrer o B-tree de `proprietario` na ordem do `ORDER BY` e filtrar —
com 10% de acerto, ele acha 20 linhas quase imediatamente. O `LIMIT` muda o plano
ótimo, e nenhum índice de busca ajuda nesse caso.

**3. O `COUNT` é o gargalo da paginação, não a página.** Buscar 20 linhas custa
2 ms; contar o total custa 68 ms — **34× mais**. Toda paginação por offset paga
esse preço para poder dizer "página 1 de N".

**4. `OFFSET` degrada linearmente.** A página 9000 lê 180.020 linhas para
devolver 20 — 500× mais lento que a página 1.

### Decisões que os números sustentam

- **Offset serve para este caso.** A interface leva o usuário a filtrar, não a
  paginar até a página 9000. Com filtro aplicado, o total de páginas cai e o
  offset nunca fica profundo.
- **Se a paginação profunda virar requisito real**, a correção é *keyset
  pagination* (`WHERE (proprietario, id) > (:ultimo, :id) LIMIT 20`), que tem
  custo constante — ao preço de perder o salto direto para uma página arbitrária.
- **Se o `COUNT` virar o gargalo**, `Slice` no lugar de `Page` elimina a consulta
  de contagem: a UI passa a mostrar "próxima página" sem saber o total.

Nenhuma das duas foi implementada porque, no volume em questão, seriam otimização
sem problema medido.

## 14. Proprietário como entidade (tarefas 4 e 5)

### A decisão que resolve a tarefa 5 antes de escrevê-la

Ao normalizar, o nome do proprietário deixa de existir em N linhas de `imovel` e
passa a existir em **uma linha** de `proprietario`. A tarefa 5 — "a alteração
precisa valer para todos os imóveis dele" — deixa de ser uma funcionalidade a
implementar e vira **consequência do modelo**. `RenomearProprietario` não tem uma
única linha de propagação.

### Duas operações que pareciam uma

| Ação | Endpoint | Efeito |
|---|---|---|
| Trocar o dono de um imóvel | `PUT /api/imoveis/{id}` com outro nome | **reatribui** aquele imóvel |
| Corrigir o nome de um proprietário | `PUT /api/proprietarios/{id}` | **renomeia**, e todos os imóveis acompanham |

Enquanto `proprietario` era texto dentro do imóvel, as duas eram indistinguíveis
— editar o campo fazia as duas coisas ao mesmo tempo, ou nenhuma delas
corretamente.

### O contrato da API não mudou

`ImovelRequest.proprietario` continua sendo um **nome**, não um id. `ResolverProprietario`
faz o *get-or-create*: nome conhecido reaproveita o registro, nome novo cria um.
O cliente não precisa consultar proprietários antes de cadastrar um imóvel, e o
formulário do frontend seguiu funcionando sem alteração.

`ImovelResponse` ganhou `proprietarioId` — campo novo, mudança compatível.

> **Concorrência reconhecida:** duas requisições simultâneas com o mesmo nome novo
> podem colidir na constraint `UNIQUE`. Tratar exigiria capturar a violação e
> reconsultar. Não implementado por estar fora do cenário do desafio, mas é uma
> falha real sob carga.

### A migração `V4`, passo a passo

```sql
CREATE TABLE proprietario (...);
INSERT INTO proprietario (nome, ...) SELECT DISTINCT proprietario FROM imovel;
ALTER TABLE imovel ADD COLUMN proprietario_id BIGINT;
UPDATE imovel i SET proprietario_id = p.id FROM proprietario p WHERE p.nome = i.proprietario;
ALTER TABLE imovel ALTER COLUMN proprietario_id SET NOT NULL;   -- rede de seguranca
ALTER TABLE imovel ADD CONSTRAINT fk_imovel_proprietario ...;
ALTER TABLE imovel DROP COLUMN proprietario;
```

A ordem importa. O `SET NOT NULL` vem **depois** da religação e **antes** do
`DROP COLUMN`: se algum imóvel tivesse ficado sem proprietário, ele falha e a
migration inteira sofre rollback — com a coluna de texto ainda intacta. A falha
seria alta e imediata, nunca perda silenciosa.

Verificado após aplicar: **12 imóveis, 12 proprietários, 0 órfãos.**

### N+1 evitado — e medido

`@ManyToOne(fetch = LAZY)` com o mapper lendo `getProprietario().getNome()`
dispararia um `SELECT` por imóvel. `ImovelSpecs` faz o fetch join explícito:

```java
if (consulta != null && Long.class != consulta.getResultType()) {
    raiz.fetch("proprietario", JoinType.INNER);
}
```

O guard é necessário: aplicar o fetch na consulta de contagem a tornaria inválida.

**Medição** (`pg_stat_user_tables`, antes e depois de um `GET /api/imoveis` com 13
imóveis de 12 proprietários distintos): a tabela `proprietario` recebeu **+1
acesso**, não +13.

### Duas armadilhas do Hibernate 6 encontradas

**1. Função customizada em HQL precisa ser registrada.** `sem_acento()` funcionava
no `ImovelSpecs` (Criteria API renderiza o nome direto) mas quebrava a subida ao
ser usada em `@Query`. A correção é um `FunctionContributor` declarado em
`META-INF/services/org.hibernate.boot.model.FunctionContributor`.

**2. `function('nome', args)` não consulta o registro de tipos.** Mesmo após
registrar, a forma genérica devolve `Object` e o Hibernate rejeita:
`Operand of 'like' is of type 'java.lang.Object'`. É preciso chamar a função
**pelo nome** — `sem_acento(p.nome)` — para a tipagem registrada valer.

### Contagem de imóveis sem N+1

`listarComContagem` traz nome e quantidade em **uma consulta** (`left join` +
`group by`), em vez de listar proprietários e contar imóveis por linha. A
`countQuery` é explícita porque o `GROUP BY` impede o Spring Data de derivar uma
contagem correta sozinho.

### Duplicação removida no caminho

A normalização de acentos passou a existir em dois lugares (filtro de imóveis e
de proprietários). Foi extraída para `br.com.webgis.busca.TermoDeBusca`, que é
agora a contraparte Java única da função `sem_acento()` do banco.

---

## Verificação

Testes de ponta a ponta executados contra a aplicação rodando:

| Cenário | Antes | Depois |
|---|---|---|
| `GET /api/imoveis/99999` | `200` corpo vazio | `404` + ProblemDetail |
| `GET /api/imoveis/abc` | — | `400` (não `500`) |
| `POST` com 5 campos inválidos | `200 {"status":"ok"}` | `400` com 5 mensagens |
| `POST` com SQL injection no proprietário | injeção | gravado como texto, tabela intacta |
| `POST` válido | `200` | `201` + `Location` |
| `DELETE` / repetido | `200 ok` nas duas | `204` / `404` |
| CORS de `localhost:4200` | `*` (qualquer origem) | liberado |
| CORS de origem não autorizada | `*` (permitia) | `403` |
| Reiniciar a aplicação | +12 registros por boot | 0 migrations, 12 registros |
| `?proprietario=lima` | — | 1 resultado |
| `?municipio=goiania` (sem acento) | — | encontra "Goiânia" |
| `?page=1&size=5` | — | 3 páginas, itens 6 a 10 |
| `?size=999999` | — | limitado a 100 |
| Migração V4 | 12 imóveis com nome em texto | 12 imóveis, 12 proprietários, 0 órfãos |
| `POST` com nome já existente | — | reaproveita o proprietário, não duplica |
| `PUT /api/proprietarios/7` | — | os 2 imóveis dele acompanham o novo nome |
| `GET /api/imoveis?proprietarioId=7` | — | só os imóveis daquele dono |

---

## 15. `PaginaResponse` fora de `imovel` — o pacote `comum`

> **O pacote `comum` não existe mais.** A seção 24 reorganizou o backend por
> camada técnica, e `PaginaResponse` passou a viver em `dto`. O problema que
> esta seção descreve — uma feature importando de outra — continua tendo a mesma
> resposta, agora por outro caminho.

`PaginaResponse` nasceu junto com a paginação da listagem de imóveis (seção 12) e
ficou onde foi escrito: `br.com.webgis.imovel.dto`. Quando a tarefa 4 trouxe os
proprietários, `ProprietarioController` e `ConsultarProprietarios` passaram a
importar de lá:

```java
import br.com.webgis.imovel.dto.PaginaResponse;   // ...dentro de proprietario/
```

O layout aqui é **package-by-feature**: `imovel` e `proprietario` são fatias
verticais, cada uma com entidade, repositório, casos de uso e DTOs. Nesse
arranjo, `proprietario` depender de `imovel` deveria significar uma relação de
domínio — e não existe nenhuma. A dependência era acidental: as duas features só
compartilham o *formato* do envelope.

O custo não é estético. Uma feature que importa de outra por acaso é uma feature
que não se move: extrair `proprietario` para outro módulo, ou apagar `imovel`,
arrastaria junto um tipo que nada tem a ver com a mudança.

`PaginaResponse` foi para `br.com.webgis.comum`, com um `package-info.java` que
declara a regra de admissão:

> Entra o que não pertence a nenhuma feature. Se um tipo só é "comum" porque duas
> features ainda não divergiram, ele fica na feature de origem até a segunda
> precisar dele de verdade.

A ressalva importa. `comum` sem critério vira o depósito onde tudo acaba, e o
acoplamento volta pela porta dos fundos — todo mundo passa a depender de um
pacote que muda por qualquer motivo.

`TermoDeBusca` **não** se moveu, apesar de também ser usado pelas duas features.
Ele já vive em `br.com.webgis.busca`, um pacote de topo com responsabilidade
própria (preparar o termo para a função `sem_acento` criada na V3), não dentro de
uma fatia vertical. O problema nunca foi "ser compartilhado" — foi "estar dentro
de uma feature".

---

## 16. Endurecimento do backend

Quatro mudanças pequenas, ligadas por um tema: fazer o sistema **falhar onde
deve falhar** e parar de falhar onde não devia.

### `DominioInvalidoException` — o 400 volta a ser deliberado

Os value objects lançavam `IllegalArgumentException`, e o `ManipuladorDeErros`
mapeava esse tipo para `400`. O problema é que `IllegalArgumentException` é da
JDK: ela chega de qualquer lugar da pilha — Spring, Hibernate, uma biblioteca
qualquer, um `if` errado nosso.

Resultado: **qualquer bug de programação que passasse por ali virava "Dados
inválidos"**, com a culpa no usuário. Sem log, sem código de correlação, sem
rastro. O handler genérico — que existe exatamente para isso, com `log.error` e
UUID — nunca era alcançado.

A seção 9 já registrava a armadilha do handler genérico. Este era o caso
simétrico: um handler *específico* largo demais.

Agora o domínio lança `DominioInvalidoException` (em `comum`, porque `imovel` e
`proprietario` lançam os dois). O `400` só vale para o que o domínio rejeitou de
propósito; o resto volta a cair na rede de segurança.

### `open-in-view=false`

O `Imovel.proprietario` é `LAZY` e o `ImovelSpecs` faz `fetch join` explícito
(seção 12). Com `open-in-view=true`, uma consulta futura que **esquecesse** o
fetch join não falharia: carregaria preguiçosamente durante a serialização, e o
N+1 voltaria em silêncio — invisível até alguém olhar o log de SQL.

Com `false`, o esquecimento vira `LazyInitializationException` na hora.

Seguro porque todo mapeamento para DTO já acontece dentro de `@Transactional`.
O único ponto que dependia de carga tardia é o `ConsultarImoveis.buscarPorId`,
que lê o proprietário depois do `findById` — e roda sob
`@Transactional(readOnly = true)` de classe. Verificado: `GET /api/imoveis/3`
responde `200` com o nome do proprietário preenchido.

### `PaginaResponse.de(Page)`

`ConsultarProprietarios` chamava `de(pagina, resposta -> resposta)` — uma
conversão identidade, com comentário explicando que não havia o que converter.
Um overload de um argumento resolve, e a chamada passa a dizer o que faz.

---

### A corrida do `ResolverProprietario` — e a correção que estava errada

`porNome` fazia consulta-depois-insert:

```java
return repository.findByNomeIgnoreCase(nome)
        .orElseGet(() -> repository.save(new Proprietario(nome)));
```

Entre as duas linhas há uma janela. Dois cadastros simultâneos com o mesmo nome
novo passam ambos pelo `findBy` e ambos tentam inserir; a constraint
`uk_proprietario_nome` derruba um deles com `500` — para um usuário que não fez
nada de errado.

**Primeira tentativa: `REQUIRES_NEW`.** Isolar o insert em transação própria,
capturar a violação e reler o registro do vencedor. Uma classe
`CadastroDeProprietario` separada, porque propagação só vale atravessando o
proxy do Spring.

A lógica funcionava. Sob carga real, o resultado foi este:

| Rodada | 20 POSTs simultâneos, mesmo nome novo |
|---|---|
| 1 | 20× `201` |
| 2 | 20× `201` |
| 3 | 8× `201`, **12× `500`** |
| 4 | 6× `201`, **14× `500`** |
| 5 | 20× `201` |

Os `500` **não eram violações de constraint** — as 26 violações que ocorreram
foram todas capturadas e recuperadas corretamente. A causa era outra:

```
HikariPool - Connection is not available, request timed out after 30000ms
(total=10, active=10, idle=0, waiting=7)
```

`REQUIRES_NEW` faz cada requisição segurar **duas conexões ao mesmo tempo**: a
da transação externa, suspensa mas não devolvida, mais a da interna. Com o pool
padrão de 10, dez cadastros simultâneos seguram as dez conexões externas e ficam
esperando por uma interna que nunca vai existir. Auto-deadlock — e um problema
muito pior que a corrida original, porque atinge qualquer carga concorrente, não
só nomes repetidos.

**Correção adotada: resolver onde a constraint mora.**

```sql
insert into proprietario (nome, criado_em, atualizado_em)
values (:nome, now(), now())
on conflict on constraint uk_proprietario_nome do nothing
```

Quem chega primeiro grava; quem chega depois não faz nada. Ninguém levanta
exceção, a transação do caso de uso nunca é marcada como rollback-only, e a
releitura logo abaixo devolve o registro vencedor para os dois. **Uma transação,
uma conexão.**

Três ressalvas, porque a solução não é de graça:

- **Native query.** `ON CONFLICT` não existe em JPQL. O `:nome` é parâmetro
  vinculado, não concatenação — nada a ver com o problema que a seção 2 corrigiu.
- **Passa por fora do Hibernate**, então `@CreationTimestamp` não atua e as
  colunas de auditoria são preenchidas com `now()` no próprio SQL.
- **As invariantes continuam valendo**: o `ResolverProprietario` constrói
  `new Proprietario(nome)` antes de inserir e usa o `getNome()` já normalizado.
  O construtor roda; só o `INSERT` é que não sai por ele.

Mesma carga, depois da troca:

| Rodada | 20 POSTs simultâneos, mesmo nome novo | Proprietários criados |
|---|---|---|
| 1 a 5 | 20× `201` em todas | 1 por rodada, com 20 imóveis |

100 requisições concorrentes, zero `500`, zero duplicatas.

> **Nota de configuração:** o pool do Hikari está no padrão de 10 conexões. Não
> foi alterado — o ponto aqui era remover a amplificação, não escondê-la atrás de
> um pool maior. Mas o número merece ser revisto junto com a medição da tarefa 6.

---

## 17. Configuração de desenvolvimento fora do padrão

`application.properties` carregava duas coisas que são úteis em desenvolvimento e
problema em produção:

```properties
spring.jpa.show-sql=true
logging.level.br.com.webgis=DEBUG
```

`show-sql` escreve **toda** consulta no stdout. Em volume isso derruba a
throughput, enche o disco de log e ainda expõe a estrutura do banco para quem
tiver acesso ao arquivo. Estava ligado por padrão, ou seja, ligado em qualquer
lugar onde a aplicação subisse.

As duas foram para `application-dev.properties`, que só vale com o perfil ativo:

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

A senha do banco também saiu de valor fixo:

```properties
spring.datasource.username=${DB_USUARIO:postgres}
spring.datasource.password=${DB_SENHA:postgres}
```

O padrão depois dos dois-pontos preserva o setup do README — quem for avaliar
não precisa configurar nada — mas onde a senha não puder morar no arquivo,
basta a variável de ambiente. Era a ressalva registrada na tabela "o que ficou de
fora"; deixou de ser necessária porque a solução não custa o setup de ninguém.

O README foi atualizado com as duas informações.

---

## 18. Endpoint do mapa (tarefa 7)

A tela de mapa precisa de todos os imóveis de uma vez — ou o ponto está
desenhado, ou não está. Isso conflita com a decisão da seção 12, que paginou a
listagem justamente para nunca devolver o conjunto inteiro.

A saída **não** foi reusar `GET /api/imoveis` com um `size` grande. O teto de 100
por página existe por um motivo, e furá-lo pela query string transformaria a
proteção em convenção. O mapa ganhou endpoint próprio, com teto no servidor e o
total ao lado.

### O contrato

| Tipo | Campos | Por quê |
|---|---|---|
| `PontoNoMapaResponse` | `id`, `proprietario`, `municipio`, `uf`, `latitude`, `longitude`, `ativo` | 7 campos contra os 14 do `ImovelResponse`. O mapa não lê bairro, rua, número, área nem os dois timestamps ISO-8601 — reusar o contrato da listagem dobraria os bytes por imóvel para entregar campo que a tela não abre |
| `MapaResponse` | `pontos`, `total`, `truncado` | envelope, e não array cru |

O envelope existe pela mesma razão do `PaginaResponse`: **uma lista crua não
consegue dizer que foi cortada**. Sem ele, a tela desenharia 500 pontos de um
cadastro com 12.430 sem nada avisando, e quem olhasse concluiria que o cadastro
tem 500 imóveis. `total` é a contagem que atende ao filtro, não o tamanho de
`pontos` — é a diferença entre os dois que dá sentido ao aviso na tela.

`truncado` é componente do record, e não um método derivado. A primeira versão
era `public boolean truncado()` fora dos componentes; voltei atrás porque o
Jackson serializa record pelos componentes, e um método extra depender de
detalhe de versão da biblioteca para aparecer no JSON é risco desnecessário em
um contrato. Calculado uma vez na fábrica `MapaResponse.de`, servidor e cliente
não têm como discordar.

Os dois records ficaram em `imovel/dto`, e não em `comum`: pela regra que o
`comum/package-info.java` estabeleceu na seção 15, um tipo só sobe para lá
quando uma segunda feature precisa dele de verdade. Mapa, hoje, só existe para
imóvel.

### A consulta

```java
private static final int LIMITE_DE_PONTOS = 500;
private static final Sort ORDEM_DO_MAPA = Sort.by(Sort.Direction.ASC, "id");

public MapaResponse mapear(ImovelFiltro filtro) {
    Page<Imovel> recorte = repository.findAll(
            ImovelSpecs.comFiltro(filtro),
            PageRequest.of(0, LIMITE_DE_PONTOS, ORDEM_DO_MAPA));
    ...
}
```

Três decisões:

**Reusa `ImovelSpecs.comFiltro`.** Filtrar por proprietário no mapa e no grid tem
que significar a mesma coisa, inclusive na busca sem acento da seção 12. Uma
segunda montagem de `WHERE` aqui seria a divergência esperando para acontecer —
ninguém notaria até alguém buscar "sao" e obter conjuntos diferentes nas duas
telas.

**`Page`, e não `List`.** O `total` que a tela mostra já vem do `findAll`
paginado, que emite o `count` na mesma chamada. Pedir `List` e depois um
`count(spec)` seria o mesmo resultado em duas passadas pelo `Specification`.

**O teto exige `ORDER BY`.** Cortar em 500 obriga a decidir *quais* 500. Sem
ordenação o Postgres não promete a mesma resposta duas vezes, e um F5 trocaria os
pontos da tela sem nada ter mudado no banco. Por `id` porque é a ordenação mais
barata que existe aqui (índice da chave primária) e porque o mapa, ao contrário
da listagem, não tem ordem própria a respeitar: pontos não têm "primeiro".

**Por que 500.** Não é limite técnico — o Postgres devolve 200 mil sem suar. É
limite de legibilidade: acima dessa ordem de grandeza os marcadores viram uma
mancha e a tela deixa de informar. E o navegador quebra antes do servidor,
tentando desenhar. O número está nomeado e justificado no código, porque `500`
solto é exatamente o número mágico que a seção 14 do frontend foi caçar.

### A rota

```
GET /api/imoveis/mapa?proprietario=&municipio=&proprietarioId=
```

Declarada antes de `/{id}` no controller. O Spring escolhe por especificidade do
padrão, e não pela ordem dos métodos, então `/api/imoveis/mapa` casa na rota
literal de qualquer forma — mas se casasse no `{id}`, o `Long` não aceitaria
`"mapa"` e a rota responderia `400`. A ordem no arquivo não muda o roteamento;
deixa a armadilha visível para quem for mexer.

### Verificação

| Chamada | Resultado |
|---|---|
| `GET /api/imoveis/mapa` | `total=12`, `truncado=false`, 12 pontos de 7 campos |
| `GET /api/imoveis/mapa?municipio=sao` | `total=2`, os dois "São Paulo" — o `unaccent` atravessou |
| `GET /api/imoveis/1` | `200` — `/{id}` não foi capturado pela rota nova |
| teto baixado a 5, temporário | `total=12`, `truncado=true`, `pontos=5`, ids `[1..5]` — recorte estável |

O caminho do `truncado` só se prova quebrando o teto. Com 12 registros no seed, a
única forma honesta era baixá-lo, medir e devolvê-lo a 500.

---

## 19. UF de verdade, e as localidades do filtro

Duas mudanças que andam juntas: fechar a brecha na validação da UF e passar a
oferecer estado e cidade como lista, em vez de texto livre.

### A brecha

A UF era validada assim:

```java
@Pattern(regexp = "[A-Za-z]{2}", message = "UF deve ter exatamente 2 letras")
```

Duas letras quaisquer. `XX`, `ZZ` e `AA` passavam, e o imóvel entrava no banco
com uma UF que não existe — o filtro por estado nunca o acharia, e o mapa o
desenharia num lugar que não corresponde a nada. O `Endereco` repetia a mesma
regra fraca (`matches("(?i)[a-z]{2}")`).

Agora existe o enum `UnidadeFederativa`, com as 27 — 26 estados mais o Distrito
Federal —, e a anotação `@UfValida` que pergunta a ele.

**Enum, e não tabela no banco.** A lista tem 27 itens e não muda desde 1988. Uma
tabela custaria migration, join na leitura e uma consulta por cadastro para
validar o que o compilador já garante. Se a divisão política mudar, muda-se aqui
e recompila — que é exatamente a frequência do evento.

**Anotação própria, e não um `@Pattern` com as 27 siglas alternadas.** Seria uma
linha a menos e a lista ficaria escrita duas vezes, sem nada garantindo que as
duas continuassem iguais. Anotação própria também preserva o formato de erro que
o frontend já consome: uma mensagem por campo, entregue no campo `uf`.

**A regra vale nos dois lugares, e a lista continua num só.** `@UfValida` protege
a API; o construtor de `Endereco` protege a entidade de qualquer outro caminho de
criação — migração, carga, teste, código futuro. As duas perguntam ao mesmo enum,
então não há duplicação de lista, só de aplicação. O `Endereco` também passou a
gravar a sigla normalizada pelo enum, em vez de um `toUpperCase()` solto.

O que **não** foi feito, e é decisão consciente: validar o município contra os
5.570 do IBGE. Isso exigiria embarcar a lista (ou depender da API do IBGE no
caminho do cadastro, o que faria o IBGE fora do ar impedir cadastro aqui). A UF
é o que amarra o endereço ao Brasil; o município segue texto livre.

### Filtro por UF

`ImovelFiltro` ganhou o componente `uf`, e `ImovelSpecs` o predicado. Igualdade,
e não `LIKE`: sigla é valor fechado, vindo de um select.

Sigla inexistente **não** é descartada na normalização — fica como está e não
casa com nada, devolvendo lista vazia. Ignorar o filtro inválido devolveria a
base inteira, que é pior: pareceria que a busca funcionou.

O parâmetro entrou nos dois endpoints, porque os dois compartilham o mesmo
`ImovelFiltro` e a mesma `Specification`. Hoje só o mapa o usa; a listagem o
aceita de graça, e quando ganhar o filtro na tela não haverá backend a mexer.

### As localidades

```
GET /api/localidades/ufs                    → [{sigla, nome, quantidadeDeImoveis}]
GET /api/localidades/ufs/{uf}/municipios    → [{nome, quantidadeDeImoveis}]
```

**Duas fontes, duas perguntas.** O enum é a fonte da *validação* — o que se pode
cadastrar, as 27. Estas consultas são a fonte do *filtro* — o que existe para
procurar, que sai de um `GROUP BY` no banco. Oferecer as 27 no select faria 22
delas devolverem "nenhum imóvel", e quem usa descobriria isso um estado por vez.

**A contagem sai de graça.** Vem do mesmo `GROUP BY` que monta a lista, então não
custa consulta a mais — e diz de antemão quanto o filtro vai devolver.

**O nome por extenso vem do enum, não do banco.** A coluna guarda só a sigla;
gravar o nome junto seria repetir 200 mil vezes uma informação de 27 valores
possíveis que nunca muda.

**Rota própria, e não `/api/imoveis/localidades`.** O que se pede aqui não é
imóvel — é o vocabulário com que se procura imóvel. O aninhamento
`/ufs/{uf}/municipios` diz o que o dado é: município, aqui, só existe dentro de
uma UF. É também o que sustenta carregar as cidades sob demanda em vez das de
todos os estados de uma vez.

**Classes no pacote `imovel`, mesmo com rota separada.** A informação vem do
endereço dos imóveis; um pacote `localidade` sugeriria uma entidade Localidade, e
não existe nada a criar, editar ou excluir.

**UF inexistente no caminho é `400`, não lista vazia.** Lista vazia diria "esta UF
não tem imóveis", que é outra coisa, e esconderia o erro de quem chamou. Reusa o
`DominioInvalidoException` que o `ManipuladorDeErros` já traduz.

### Migration `V5` — índice por UF

Índice B-tree em `imovel(uf)`, com a ressalva escrita no próprio arquivo: com no
máximo 27 valores a cardinalidade é baixa, e o planejador provavelmente o ignora
no filtro de UF isolado. Ele entra pelo caso que a tela produz — UF **combinada**
com município ou proprietário, onde o Postgres pode cruzá-lo com o GIN de
trigramas do `V3` por bitmap AND — e pelo `GROUP BY uf` que monta o select.

### Verificação

| Chamada | Resultado |
|---|---|
| `POST /api/imoveis` com `uf: "XX"` | `400`, `erros.uf` = "UF deve ser uma das 27 unidades federativas do Brasil" |
| `POST /api/imoveis` com `uf: "s"` | `400`, mesma mensagem |
| `GET /api/localidades/ufs` | 10 UFs, com nome e contagem — as que o seed tem, não as 27 |
| `GET /api/localidades/ufs/sp/municipios` | `200`, "São Paulo (2)" — sigla em caixa baixa aceita |
| `GET /api/localidades/ufs/XX/municipios` | `400` com ProblemDetail |
| `GET /api/imoveis/mapa?uf=rj` | 2 pontos, todos `RJ` |
| `GET /api/imoveis?uf=SP` | `totalDeItens=2`, todos `SP` |
| `GET /api/imoveis/mapa?uf=XX` | `total=0` — não devolve a base inteira |
| `flyway_schema_history` | `V5` aplicada, `idx_imovel_uf` criado |

---

## 20. Geometria do imóvel (tarefa 8)

> Duas decisões desta seção mudaram na quinta rodada: a `geom` deixou de ser
> coluna gerada e o `ImovelResponse` passou a expor o polígono. O que motivou
> cada mudança está na seção 21.

O imóvel deixa de ser um ponto com um número de metros quadrados ao lado e passa
a ter área real, com o sistema recusando cadastro que invada outro.

### Onde a geometria mora

A coluna `geom` é **`GENERATED ALWAYS ... STORED`**, derivada de latitude,
longitude, largura e comprimento pela função `lote_retangular`. A aplicação nunca
a escreve.

É a única forma de garantir que ela não divirja. Se a aplicação gravasse,
bastaria um caminho de atualização esquecer de recalcular para o polígono passar
a descrever um imóvel que não está mais ali — e nada acusaria, porque o ponto e a
área continuariam coerentes entre si.

A função é `IMMUTABLE` (exigência da coluna gerada) e `STRICT`. O `STRICT` resolve
os 12 imóveis da carga inicial com elegância: eles não têm dimensões, nenhuma
migration pode inventá-las, e argumento nulo devolve nulo. **Imóvel sem geometria
é estado válido** — a mesma disciplina da tarefa 4, que não podia perder o
proprietário em texto.

Convenções que o enunciado deixou em aberto e alguém tinha de decidir: o ponto
informado é o **centro** do lote, e o retângulo é alinhado aos eixos da projeção
— largura no eixo leste-oeste, comprimento no norte-sul. Lote rotacionado por
azimute ficou fora do escopo, registrado aqui.

### Sem `hibernate-spatial`, e isso é decisão

O caminho esperado seria mapear `geom` como `org.locationtech.jts.geom.Polygon`
com o `hibernate-spatial`. Não foi feito: **nenhuma linha de Java manipula a
geometria.** O banco a deriva, o banco a compara, e o que sobe para a tela é
GeoJSON. A dependência custaria um artefato a mais para um campo que só é lido.

O polígono chega à entidade por `@Formula`, com o próprio Postgres convertendo na
leitura:

```java
@Formula("ST_AsGeoJSON(ST_Transform(geom, 4326))")
private String poligono;
```

### `ST_Overlaps`, não `ST_Intersects`

> **Corrigido depois.** A conclusão desta subseção estava incompleta:
> `ST_Overlaps` também é `false` quando um lote contém o outro, e deixava passar
> um terreno desenhado inteiramente dentro de outro. A condição em uso hoje é
> `ST_Intersects AND NOT ST_Touches` — ver a seção 22.

Medido antes de escolher, com dois retângulos de teste:

| Cenário | `ST_Intersects` | `ST_Overlaps` | `ST_Touches` | Área da interseção |
|---|---|---|---|---|
| Lotes vizinhos, dividindo a divisa | `true` | `false` | `true` | **0** |
| Lotes que se sobrepõem | `true` | `true` | `false` | 50 |

`ST_Intersects` recusaria o cadastro de todo vizinho encostado — o caso mais
comum de um cadastro imobiliário. É o erro clássico desta tarefa, e a biblioteca
não avisa: ela responde exatamente o que foi perguntado.

A consulta reusa a **mesma** `lote_retangular` da coluna gerada, então o polígono
testado é idêntico, bit a bit, ao que será gravado. Remontar o retângulo em Java
abriria espaço para os dois discordarem.

### Duas defesas, para dois problemas diferentes

| Camada | O que faz | Precisão |
|---|---|---|
| `VerificarSobreposicao` | `ST_Overlaps` sobre a geometria real, em dupla precisão. Produz o `409` com a mensagem e o id do conflitante. | exata |
| `EXCLUDE USING gist` | Fecha a corrida entre requisições simultâneas, que nenhuma consulta em `SELECT` resolve. | ~1,2 m |

**Por que a constraint não pode ser exata**, e este é o achado da seção. O
operador `&&` compara *bounding boxes*, e o PostGIS guarda essas caixas em
`float4`. Na magnitude das coordenadas UTM daqui, o passo do `float4` é:

| Eixo | Magnitude | Passo |
|---|---|---|
| Easting | ~673.668 | 0,125 m |
| Northing | ~7.190.000 | **0,50 m** |

Como retângulo alinhado aos eixos tem *bounding box* igual ao próprio polígono,
dois lotes que dividem a divisa são recusados pelo `&&`. A saída é encolher a
geometria antes de comparar — e o encolhimento precisa ser maior que o passo do
`float4`. Medido:

| Encolhimento | Vizinho leste-oeste | Vizinho norte-sul |
|---|---|---|
| 0,001 · 0,01 · 0,05 m | recusado | recusado |
| 0,10 m | passa | recusado |
| **0,50 m** | passa | passa |

A constraint ficou com `ST_Buffer(geom, -0.6)`, que dá folga sobre o passo.
Minha primeira tentativa usou 1 mm e recusou o vizinho legítimo — o encolhimento
era invisível para o `float4`.

**Janela residual, dita com todas as letras:** duas requisições simultâneas
criando lotes que se sobrepõem em menos de ~1,2 m passam pelas duas defesas.
Fechá-la pediria isolamento `SERIALIZABLE` ou advisory lock por célula de grade,
que é mais máquina do que o exercício pede.

### A projeção fixa, e o que ela custa

`SRID 31982` é SIRGAS 2000 / **UTM zona 22S**, como o enunciado especifica. A
faixa útil da zona vai de 54°W a 48°W, e o seed está quase todo fora:

| Dentro da zona 22 | Fora |
|---|---|
| Porto Alegre (0,2°), Curitiba (1,7°), Goiânia (1,7°), Florianópolis (2,5°) | São Paulo (4,3°), BH (7,1°), Rio (7,8°), Salvador (12,5°), Fortaleza (12,5°), **Recife (16,1°)** |

Medido: **100 m projetados na zona 22, em Recife, valem 96,17 m no terreno** —
quase 4% de erro.

A nuance que decidiu manter o SRID do enunciado: a distorção é **consistente**.
Dois lotes na mesma região ficam ambos encolhidos na mesma proporção, então a
detecção de sobreposição continua correta em todo o país. O que fica errado é a
área absoluta — "largura de 20 m" gera um polígono de 19,2 m em Recife. Um
cadastro municipal real não tem esse problema porque cada município fica numa
zona só.

### Dimensões opcionais, e a área que passa a ser derivada

Largura e comprimento são opcionais, mas **indivisíveis**: informar só um é `400`.
A regra vive no construtor de `Dimensoes` — o tipo torna o par incompleto
impossível de representar — e o banco a repete em
`ck_imovel_dimensoes_completas`, protegendo a tabela de qualquer outro caminho.

Com o par preenchido, `areaM2` passa a ser largura × comprimento e o valor
digitado é descartado. Dois números descrevendo o mesmo lote acabariam
divergindo, e o polígono desenhado no mapa é o que o usuário vai acreditar.

### Um caminho que não funciona, registrado para ninguém repetir

`ImovelResponse` **não** expõe o polígono, e não é esquecimento.

`@Formula` só é avaliada em `SELECT`. Logo após um `POST` ou `PUT` o campo ainda
é nulo na entidade em memória — o banco já calculou a geometria, o Hibernate é
que não releu. Um contrato que devolve nulo na criação e valor na releitura mente
sobre o que aconteceu.

A correção idiomática seria `@Generated(event = {INSERT, UPDATE})` sobre a
`@Formula`. **Não funciona:** o Hibernate monta um `SELECT` inválido para o
pós-insert e a gravação inteira falha com `SQLGrammarException: erro de sintaxe
em ou próximo a "."`. Testado.

Como nenhum cliente consome a geometria na resposta de escrita — a tela de edição
quer largura e comprimento, e quem desenha é o mapa —, o campo saiu do
`ImovelResponse` e ficou só no `PontoNoMapaResponse`, onde a leitura vem sempre
de um `SELECT` fresco.

### Verificação

| Situação | Resultado |
|---|---|
| Migration `V6` | aplicada; schema na versão 6, com `geom` gerada, `idx_imovel_geom`, `uk_imovel_sem_sobreposicao` e as duas `CHECK` |
| Seed após a migration | 12 imóveis, **0 com geometria** — nenhum dado perdido, nenhuma dimensão inventada |
| `POST` 20×30 com área digitada 999 | `201`, `areaM2 = 600` — a área digitada foi descartada |
| `POST` de vizinho colado (centro +20 m) | `201` — divisa compartilhada não é sobreposição |
| `POST` sobreposto (centro +10 m) | `409`, `title` "Área em conflito", com `idDoImovelConflitante` |
| `POST` só com largura | `400`, "Informe largura e comprimento juntos, ou nenhum dos dois" |
| `POST` sem dimensões, área 500 | `201`, área preservada, geometria nula |
| `PUT` no próprio imóvel | `200` — o `idIgnorado` impede o lote conflitar consigo mesmo |
| `GET /api/imoveis/mapa` | pontos e polígonos na mesma resposta, cada um conforme o que se sabe do imóvel |

Os imóveis criados nos testes foram excluídos; a base voltou aos 12 do seed.

---

## 21. Lote com polígono livre (V7)

O lote da seção 20 era sempre um retângulo alinhado aos eixos da projeção:
largura no eixo leste-oeste, comprimento no norte-sul. Servia para demonstrar a
geometria, mas descreve mal a realidade — lote de esquina é inclinado, e terreno
irregular não é retângulo nenhum.

Agora o contorno é desenhado no mapa, vértice a vértice.

### O que a mudança custa

A `geom` era `GENERATED ALWAYS`, e essa decisão dava de graça a garantia de que
a geometria nunca divergia de latitude, longitude e dimensões. Com o desenho
livre ela vira **dado de entrada**, e a garantia precisa ser reconstruída à mão:

```sql
ALTER TABLE imovel ADD CONSTRAINT ck_imovel_geom_valida
    CHECK (geom IS NULL OR ST_IsValid(geom));

ALTER TABLE imovel ADD CONSTRAINT ck_imovel_ponto_dentro_do_lote
    CHECK (geom IS NULL OR ST_DWithin(geom, <ponto reprojetado>, 0.5));
```

A tolerância de 0,5 m na segunda não é frouxidão: o ponto é gravado em
`NUMERIC(10,7)`, o que já arredonda cerca de 1 cm, e o valor reprojetado ida e
volta não retorna sobre o mesmo pixel.

O backfill preserva o que existia — quem tinha dimensões recebe o mesmo
retângulo que a coluna gerada produzia, no mesmo espírito da V4. E
`lote_retangular` **continua existindo**: informar largura e comprimento segue
funcionando, agora montando o polígono na escrita em vez de por coluna gerada.

### Sem `hibernate-spatial`

A seção 20 justificou não trazer JTS porque nenhuma linha de código manipulava a
geometria. Isso mudou — agora ela é gravada. Ainda assim a dependência não
entrou: o polígono nunca vira objeto Java. Sai do `GeoJsonDoLote` como texto e
chega ao banco em `ST_GeomFromGeoJSON`, que reprojeta de 4326 para 31982 na
própria gravação.

O `GravarGeometriaDoLote` é o único lugar que escreve `geom`, e faz tudo em um
comando só — geometria, ponto, área, dimensões e timestamp — porque as quatro
colunas descrevem a mesma coisa: dois updates deixariam uma janela em que a área
diz uma medida e o polígono outra.

| Decisão | Por quê |
|---|---|
| `ST_PointOnSurface`, e não `ST_Centroid` | O centroide de um terreno em L cai **fora** do próprio terreno, e a CHECK recusaria a gravação |
| `largura`/`comprimento` zerados ao desenhar | O polígono venceu; manter as medidas antigas seria guardar um retângulo que não existe mais |
| `entityManager.refresh` no fim | A `@Formula` só é lida quando a linha é carregada. Sem o refresh, a resposta do POST viria sem o lote recém-desenhado |
| `ImovelResponse` passa a expor o polígono | A tela de edição precisa dele para recarregar o desenho. É o que a seção 20 dizia não ser possível — passou a ser, por causa do refresh |
| Máximo de 500 vértices | Não é limite do PostGIS: é o ponto em que a origem deixa de ser alguém desenhando um terreno |

Contorno inválido é recusado **antes** de gravar, com `ST_IsValidReason`. A
constraint pegaria o caso, mas como `DataIntegrityViolationException` — 500 ou
uma mensagem que não diz o que há de errado. O motivo do PostGIS vem em inglês
e com a coordenada em UTM (`Self-intersection[669937.49 7183015.61]`), então é
traduzido: *"O contorno do lote se cruza. Refaça o desenho sem que as linhas
passem umas sobre as outras."*

---

## 22. Dois defeitos na validação de sobreposição

Testar o polígono livre expôs dois problemas que já existiam desde a V6 e que
lotes retangulares pequenos nunca revelaram.

### `ST_Overlaps` aceitava lote dentro de lote

`ST_Overlaps` exige que **nenhuma** das geometrias contenha a outra. Um lote
desenhado inteiramente dentro de outro devolvia `false` e passava pela
validação. Quem recusava era a constraint de exclusão, no commit, com mensagem
genérica e sem o id do imóvel conflitante.

A condição correta é *intersecta, mas não apenas se toca*:

```sql
ST_Intersects(i.geom, g.lote) AND NOT ST_Touches(i.geom, g.lote)
```

`ST_Touches` isola exatamente o caso que o `ST_Overlaps` protegia — dois
vizinhos que dividem a divisa, com área de interseção zero.

### A trava do banco recusava vizinho legítimo (V8)

O encolhimento de 0,6 m da V6 foi medido com lotes de algumas dezenas de metros.
Com lotes rurais o número não serve mais. Medido nesta base, com dois terrenos
de ~53 ha lado a lado:

| | |
|---|---|
| Gap real entre as geometrias encolhidas em 0,6 m | **0,189 m** |
| Arredondamento do bbox em `float4` no northing daqui | até **0,5 m** para cada lado |

O gap real é menor que o erro do índice, então o `&&` acusa colisão onde não há.
A borda sul de um lote largo não é reta em UTM, e a curvatura come a folga que o
encolhimento deveria garantir.

A V8 leva o encolhimento a 1,5 m. **O que se perde:** a constraint deixa de
acusar sobreposições menores que ~3 m — aceitável, porque ela nunca foi a
checagem principal. Quem recusa o cadastro com mensagem útil é o
`VerificarSobreposicao`, sobre a geometria exata; o papel da constraint é fechar
a corrida entre requisições simultâneas, e corrida real acontece com dois
cadastros do mesmo lote, não com dois lotes que se tocam por 2 m.

### Verificação

| Caso | Antes | Depois |
|---|---|---|
| Lote contido em outro | 409 pela constraint, sem id | **409 pela aplicação, com `idDoImovelConflitante`** |
| Sobreposição parcial | 409 com id | 409 com id |
| Vizinho de divisa exata (53 ha) | **409 indevido** | **201** |
| Contorno cruzando a si mesmo | — | 400 com mensagem em português |

---

## 23. CPF do proprietário (V9)

Até aqui o proprietário era identificado pelo **nome**, e isso tem um custo
óbvio: um erro de digitação cria uma segunda pessoa. O CPF resolve, mas não pode
ser obrigatório — os proprietários que já existem vieram da carga inicial e da
extração da V4, onde só havia nome, e exigir documento agora significaria
inventá-lo.

A coluna é opcional e `UNIQUE`. No Postgres, `UNIQUE` aceita vários nulos, então
a restrição vale só para quem de fato informou. Guardado apenas em dígitos —
"111.444.777-35" e "11144477735" passariam pelo UNIQUE como pessoas diferentes.

### A regra de resolução

O CPF é **obrigatório** para cadastrar ou editar imóvel (`@NotBlank` no
`ImovelRequest`). A coluna continua aceitando nulo por causa dos proprietários
anteriores à V9 — ninguém pode documentá-los retroativamente —, mas eles deixam
de receber imóveis novos sem que alguém informe o documento.

```
1. acha pelo CPF?              → liga a ele; o nome digitado NÃO decide
2. nome existe SEM CPF?        → atribui o CPF a quem já estava lá
3. nome existe COM outro CPF?  → 409, são homônimos
4. nada disso                  → cria com nome + CPF
```

O passo 1 é o ponto da mudança, e o **passo 2 é o que evita a duplicata
silenciosa**: cadastrar um imóvel para um proprietário do seed com CPF completa
o registro dele em vez de criar um segundo.

O nome digitado não entrar na decisão é deliberado. Deixá-lo vencer permitiria
que um erro de digitação criasse um cadastro paralelo para a mesma pessoa —
exatamente o que o documento existe para evitar. Corrigir a grafia continua
sendo `PUT /api/proprietarios/{id}`, que altera para todos os imóveis de uma vez.

### Validação

`Cpf.java` confere os **dois dígitos verificadores**, não apenas o tamanho. Sem
isso, "12345678901" entraria no cadastro como documento legítimo. Os 11 dígitos
repetidos são recusados à parte, porque eles *passam* na conta: "111.111.111-11"
tem verificador correto e não é CPF de ninguém.

A anotação `@CpfValido` segue a forma do `@UfValida`: não carrega regra nenhuma,
pergunta ao `Cpf`. Um `@Pattern` de 11 dígitos aceitaria "00000000000".

### Verificação

| Caso | Resultado |
|---|---|
| CPF novo | Cria o proprietário |
| Mesmo CPF, nome digitado diferente | **Mesmo proprietário**; a resposta traz o nome do cadastro |
| Nome do seed sem CPF + CPF informado | Vincula ao registro existente — não duplica |
| Nome já usado + CPF diferente | 409 "Já existe um proprietário com o nome…" |
| Verificador errado, ou 11 dígitos iguais | 400 com erro no campo `cpfDoProprietario` |
| Sem CPF, ou CPF em branco | 400 "CPF do proprietário é obrigatório" |

### O efeito de exigir o documento

Tornar o CPF obrigatório tem uma consequência que aparece na primeira edição:
**os 12 imóveis do seed não podem mais ser salvos sem que se informe um CPF**.
Não é efeito colateral indesejado — é o mecanismo pelo qual o cadastro antigo se
completa, já que o passo 2 vincula o documento ao registro que já existe em vez
de criar outro. Verificado: editar o imóvel 1 informando um CPF deu o documento
à "Maria Aparecida Souza" do seed, que seguiu com o mesmo id e o mesmo imóvel.

O caminho "sem CPF" saiu do `ResolverProprietario`, junto com o `porNome` que já
era código morto — nunca chamado desde que o `resolver` passou a existir.

### O que isto deixou em aberto

A coluna `nome` continua `UNIQUE`, então **dois homônimos com CPFs diferentes
são recusados**. O erro é explicado em vez de virar violação de constraint, mas
a limitação existe — removê-la exige decidir como o caminho sem CPF passaria a
resolver a ambiguidade.

E `GET /api/proprietarios/cpf/{cpf}` responde quem é o dono de um documento sem
qualquer autenticação. Neste desafio não há camada de auth; num sistema real,
esse endpoint precisaria de autorização.

---

## 24. Reorganização por camada

O código estava organizado **por feature**: `imovel`, `proprietario`, `comum`,
`busca`, `web`. Passou a ser organizado **por camada técnica**, a pedido — todos
os DTOs juntos, todos os serviços juntos, e assim por diante.

```
br.com.webgis
├── config/       CorsConfig, SemAcentoFunctionContributor
├── controller/   Imovel, Localidade, Proprietario
├── dto/          12 contratos de entrada e saída
├── exception/    5 exceções de domínio + ManipuladorDeErros
├── mapper/       ImovelMapper
├── model/        Imovel, Endereco, Coordenada, Dimensoes, Proprietario, UnidadeFederativa
├── repository/   ImovelRepository, ProprietarioRepository, ImovelSpecs
├── service/      os 10 casos de uso
├── util/         TermoDeBusca, GeoJsonDoLote
└── validation/   UfValida, CpfValido, Cpf
```

### O que a mudança custou

**Três classes deixaram de ser package-private.** `ImovelMapper`, `ImovelSpecs` e
`GeoJsonDoLote` eram fechadas de propósito: só quem estava no mesmo pacote as
enxergava, e isso impedia que virassem utilitário de uso geral. Separadas de
quem as usa, tiveram de virar `public`. É uma perda real de encapsulamento, e
está registrada aqui em vez de passar despercebida.

**O pacote `comum` deixou de existir**, e com ele o `package-info.java` que
explicava a regra de crescimento (ver seção 15). `PaginaResponse` foi para `dto`
e `DominioInvalidoException` para `exception`.

**O acoplamento entre features sumiu** — este foi o ganho. `ImovelRequest`
importava `CpfValido` de `proprietario`, exatamente o que o `package-info` do
`comum` dizia para evitar. Com validadores em `validation/`, a dependência
cruzada acabou.

### O que o compilador não pegava

Mover 48 arquivos e recalcular imports é trabalho mecânico, e `BUILD SUCCESS`
apareceu na primeira tentativa. Mas três referências vivem em **string**, onde o
compilador não olha:

| Onde | O que quebraria |
|---|---|
| `@Query` com `SELECT new br.com.webgis.imovel.dto.ContagemDeLocalidade(...)` | JPQL de projeção — 5 ocorrências, nas consultas de localidade e de proprietário |
| `META-INF/services/org.hibernate.boot.model.FunctionContributor` | o registro de `sem_acento`; sem ele, toda busca sem acento falha na subida |
| Comentário da `V1` citando `br.com.webgis.imovel.Imovel` | nada — mas **não pode ser corrigido**: editar migration aplicada muda o checksum e o Flyway recusa a subida |

Por isso a verificação não parou no `mvnw compile`: a aplicação subiu e cada
caminho afetado foi exercitado por HTTP.

| Caminho | Depende de | Resultado |
|---|---|---|
| `GET /api/localidades/ufs` | JPQL `ContagemDeLocalidade` | `200`, 8 UFs com contagem |
| `GET /api/proprietarios` | JPQL `ProprietarioResponse` | `200` |
| `GET /api/proprietarios?nome=maría` | função `sem_acento` registrada | `200`, achou "Maria Aparecida Souza" |
| `POST` com CPF e polígono | validation + service + util + mapper | `201`, área 8.901,35 m² |
| `POST` com CPF inválido, e com UF inválida | validators próprios | `400` nos dois |
| `POST` sobre lote existente | `VerificarSobreposicao` | `409` com o id do conflitante |

---

## O que ficou de fora, e por quê

| Item | Motivo |
|---|---|
| **Testes automatizados** | Nenhum teste existe. É a lacuna mais séria do que restou — toda a refatoração acima foi validada apenas por testes manuais de API. Deveria ser o próximo passo, e cobriria de quebra o risco posicional do `ImovelMapper`. |
| **Log estruturado** | Os `System.out.println` foram removidos, mas nenhum `Logger` entrou no lugar exceto no `ManipuladorDeErros`. |
