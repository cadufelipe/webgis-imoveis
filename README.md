# Maptriz — Teste Técnico

Cadastro de imóveis georreferenciados. O sistema já funciona: lista, cadastra,
edita e exclui imóveis.

## Stack

| Camada   | Tecnologia                          |
|----------|-------------------------------------|
| Backend  | Java 21, Spring Boot 3.5.16, Maven  |
| Banco    | PostgreSQL                          |
| Frontend | Angular 22                          |

## Pré-requisitos

- JDK 21
- PostgreSQL rodando em `localhost:5432`, **com a extensão PostGIS instalada**
  (a migration `V6` faz `CREATE EXTENSION postgis`; sem ela o backend não sobe).
  No Windows, instale pelo *StackBuilder* do PostgreSQL ou pelo bundle oficial em
  `download.osgeo.org/postgis/windows/`. O `CREATE` exige superusuário — o
  `postgres` do setup padrão já é.
- Node.js `>=22.22.3` ou `>=24.15.0` — o Angular 22 recusa iniciar no Node 20,
  apesar do que dizia a versão anterior deste README

## 1. Banco de dados

Use o comando abaixo ou crie manualmente no banco.

```bash
sudo -u postgres psql -f scripts/setup-db.sql
```


No Windows, use o `psql` da instalacao do Postgres (em `C:/Program Files/PostgreSQL/<versao>/bin`):

```bash
psql -h localhost -U postgres -f scripts/setup-db.sql
```

Cria o banco `webgis`. A aplicação conecta como o usuário `postgres` (veja
`backend/src/main/resources/application.properties`) — ajuste ali se o seu
Postgres usar outra senha.

**As tabelas são criadas pelo Flyway**, na primeira subida do backend. Não é
preciso criar nada à mão além do banco.

## 2. Backend

```bash
cd backend
./mvnw spring-boot:run
```

Sobe em `http://localhost:8080`.

O schema é gerenciado por **migrations do Flyway**, em
`src/main/resources/db/migration`. O Hibernate roda em `ddl-auto=validate`: ele
apenas confere se o schema bate com as entidades, sem alterar nada. A carga
inicial de 12 imóveis é a migration `V2`, executada uma única vez. O schema está
na versão **V9**.

> Se o JDK 21 não estiver no `PATH`, aponte o `JAVA_HOME` na chamada:
> `JAVA_HOME=/caminho/para/jdk-21 ./mvnw spring-boot:run`

Para ver o SQL gerado e os logs em `DEBUG`, suba com o perfil `dev`:

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

As credenciais do banco aceitam `DB_USUARIO` e `DB_SENHA` como variáveis de
ambiente; sem elas, valem os padrões `postgres`/`postgres` do
`application.properties`.

### Campos do imóvel

| Campo          | Tipo    | Observação                        |
|----------------|---------|-----------------------------------|
| `proprietario` | texto   | nome                              |
| `cpfDoProprietario` | texto | **obrigatório**, com ou sem pontuação. É **ele** quem identifica a pessoa |
| `municipio`    | texto   |                                   |
| `uf`           | texto   | uma das 27 UFs do Brasil          |
| `bairro`       | texto   |                                   |
| `rua`          | texto   |                                   |
| `numero`       | texto   | aceita `S/N`, `123-A`             |
| `latitude`     | número  | graus decimais (WGS 84)           |
| `longitude`    | número  | graus decimais (WGS 84)           |
| `areaM2`       | número  | área em m²; derivada quando há dimensões |
| `largura`      | número  | metros — opcional, mas só junto com `comprimento` |
| `comprimento`  | número  | metros — idem                     |
| `poligono`     | lista   | vértices `{latitude, longitude}` do lote desenhado. Máx. 500. Quando vem, manda em tudo |
| `ativo`        | boolean |                                   |

Na **resposta**, `poligono` volta como GeoJSON (`Polygon`, WGS 84) em vez da
lista de vértices — é o formato que o mapa desenha direto.

### Endpoints

| Método   | Rota                | Descrição                          | Resposta |
|----------|---------------------|------------------------------------|----------|
| `GET`    | `/api/imoveis`      | Lista paginada, com filtros        | `200` |
| `GET`    | `/api/imoveis/{id}` | Busca por id                       | `200` / `404` |
| `POST`   | `/api/imoveis`      | Cadastra                           | `201` + `Location` / `409` |
| `PUT`    | `/api/imoveis/{id}` | Atualiza                           | `200` / `404` / `409` |
| `DELETE` | `/api/imoveis/{id}` | Exclui                             | `204` / `404` |
| `GET`    | `/api/imoveis/mapa` | Pontos para o mapa, sem paginação  | `200` |

Parâmetros da listagem:

| Parâmetro      | Padrão | Observação |
|----------------|--------|------------|
| `proprietario` | —      | busca parcial, ignora acento e caixa |
| `municipio`    | —      | idem |
| `uf`           | —      | sigla exata, ex.: `SP` |
| `page`         | `0`    | zero-indexado |
| `size`         | `20`   | limitado a 100 |

### Área do imóvel e sobreposição

O lote pode ser informado de **duas formas**, e a geometria vira um `POLYGON` em
**SRID 31982** nas duas:

| Forma | Como | Resultado |
|---|---|---|
| Desenhada | `poligono` com os vértices | o contorno exato; a área sai do `ST_Area` e o ponto do imóvel é reposicionado para dentro do lote |
| Retangular | `largura` + `comprimento` (sempre os dois) | retângulo alinhado aos eixos a partir do centro; a área é o produto |

**O polígono tem precedência.** Vindo os dois, largura e comprimento são
descartados — dois desenhos do mesmo lote acabariam divergindo, e quem o usuário
acredita é o que está no mapa.

Antes de gravar, o cadastro é recusado com **`409`** se o lote invadir outro.
Lotes que apenas **dividem a divisa** são aceitos: a verificação é
`ST_Intersects` **menos** `ST_Touches`, que isola exatamente o contato de área
zero. Contorno inválido — anel aberto, menos de 3 pontos, linhas que se cruzam —
é `400` com mensagem em português.

Duas defesas, para dois problemas diferentes: a checagem exata na aplicação
produz a mensagem, e uma `EXCLUDE USING gist` no banco fecha a corrida entre
requisições simultâneas. Os limites de cada uma estão medidos nas seções 20 e 22
do `backend/REFATORACAO.md`.

Geometria é **opcional**: imóvel sem ela continua válido e não participa da
validação de sobreposição — é o caso dos 12 da carga inicial, cujas medidas
nenhuma migration poderia inventar.

### Endpoints de localidades

Alimentam os filtros de estado e cidade. Devolvem o que **existe no cadastro**,
não as 27 UFs — um select com estados sem imóvel devolveria lista vazia.

| Método | Rota                                     | Descrição                        | Resposta |
|--------|------------------------------------------|----------------------------------|----------|
| `GET`  | `/api/localidades/ufs`                   | UFs com imóveis, com contagem    | `200` |
| `GET`  | `/api/localidades/ufs/{uf}/municipios`   | Cidades daquela UF, com contagem | `200` / `400` |

A validação de UF no cadastro é outra coisa, e usa outra fonte: o enum
`UnidadeFederativa`, com as 27. `POST` ou `PUT` com `uf` fora dessa lista é `400`
com mensagem no campo. O município segue texto livre.

### Endpoints de proprietários

| Método | Rota                       | Descrição                          | Resposta |
|--------|----------------------------|------------------------------------|----------|
| `GET`  | `/api/proprietarios`       | Lista paginada, com contagem de imóveis | `200` |
| `GET`  | `/api/proprietarios/{id}`  | Busca por id                       | `200` / `404` |
| `GET`  | `/api/proprietarios/cpf/{cpf}` | Quem tem este CPF          | `200` / `404` / `400` |
| `PUT`  | `/api/proprietarios/{id}`  | Renomeia (vale para todos os imóveis dele) | `200` / `404` / `409` |

Para os imóveis de um proprietário: `GET /api/imoveis?proprietarioId={id}`.

**Identificação pelo CPF.** O `POST` e o `PUT` de imóvel exigem
`cpfDoProprietario`, e é o documento que identifica a pessoa: CPF já cadastrado
liga o imóvel àquele proprietário, sem criar outro, mesmo que o nome tenha sido
digitado de outro jeito — na tela, o nome é preenchido sozinho. Quem já estava
no cadastro **sem** CPF recebe o documento em vez de virar uma segunda linha.

Como os 12 proprietários da carga inicial não têm CPF, editar um desses imóveis
pede o documento — e é assim que o cadastro antigo se completa.

O CPF é validado pelos dígitos verificadores. Dois homônimos com CPFs
diferentes ainda são recusados (`409`), porque a coluna `nome` continua `UNIQUE`.

Erros seguem o formato **ProblemDetail (RFC 7807)**; falhas de validação trazem
uma mensagem por campo em `erros`.

## 3. Frontend

```bash
cd frontend
npm install
npm start
```

Abre em `http://localhost:4200` e consome a API em `localhost:8080`.

### Telas

| Rota | Tela |
|---|---|
| `/imoveis` | listagem, com filtros e paginação |
| `/imoveis/novo` | cadastro, com busca por CEP e desenho do lote no mapa |
| `/imoveis/:id/editar` | edição, recarregando o contorno já salvo |
| `/imoveis/mapa` | mapa dos imóveis, em Leaflet sobre OpenStreetMap, com painel de filtros |
| `/proprietarios` | listagem de proprietários |
| `/proprietarios/:id/imoveis` | imóveis de um proprietário |

O mapa usa **Leaflet** com tiles do **OpenStreetMap** — sem chave de API e sem
conta em serviço nenhum. Mostra até 500 imóveis por vez; quando o filtro atende a
mais do que isso, a tela diz quantos está mostrando de quantos, em vez de cortar
em silêncio.

O painel à direita filtra por **estado** e **cidade**, em selects encadeados
alimentados pelo backend: as opções são só as que têm imóvel cadastrado, cada uma
com a contagem ao lado, e escolher um estado carrega as cidades dele. Proprietário
continua em texto livre — nome de pessoa é conjunto aberto.

No **formulário de imóvel**, três apoios ao preenchimento:

- **CEP** — completa município, UF, bairro, rua e, quando a base tem, a
  coordenada da via. Consulta a BrasilAPI direto do navegador. Não é gravado.
- **CPF** — ao ficar completo e válido, procura quem já tem aquele documento e
  avisa na tela a que proprietário o imóvel vai ficar ligado.
- **Desenho do lote** — mini-mapa onde cada clique marca um canto do terreno.
  Fechando o contorno, a lista dos pontos aparece com as coordenadas e a área é
  calculada ao vivo, em m², hectares ou alqueires. A área definitiva é a que o
  PostGIS calcula ao salvar.

---

## Solução entregue

As decisões de projeto, na ordem em que foram tomadas e com a justificativa de
cada uma, estão documentadas em:

- **[backend/REFATORACAO.md](backend/REFATORACAO.md)** — seções 1 a 24
- **[frontend/REFATORACAO.md](frontend/REFATORACAO.md)** — seções 1 a 23

### Estrutura

Os dois módulos são organizados **por camada técnica**:

```
backend/src/main/java/br/com/webgis      frontend/src/app
├── config/      controller/             ├── models/       services/
├── dto/         exception/              ├── pages/        components/
├── mapper/      model/                  ├── pipes/        shared/
├── repository/  service/                └── app.ts, app.routes.ts, app.config.ts
└── util/        validation/
```

O trabalho aconteceu em cinco rodadas. A primeira resolveu os problemas graves
do código original e entregou as tarefas 1 a 6. A segunda atacou o que restou de
duplicação e de decisões pouco claras — nada de funcionalidade nova, exceto as
mensagens de confirmação da seção 15. A terceira entregou a tarefa 7, o mapa. A
quarta, a tarefa 8. A quinta trocou o lote retangular por polígono desenhado à
mão e acrescentou CEP e CPF.

### Segunda rodada — o que mudou e por quê

| Tema | Seção | Em uma linha |
|---|---|---|
| Tipos compartilhados no lugar certo | back. 15 · front. 10 | `proprietario` importava de `imovel` só para reaproveitar o envelope de paginação |
| Contrato do frontend honesto | front. 11 | `ImovelPayload` derivado da resposta impedia o modelo de declarar `proprietarioId` |
| Endurecimento do backend | back. 16 | 400 deliberado, `open-in-view=false`, e a corrida do proprietário resolvida no banco |
| Store de paginação único | front. 12 | a mesma listagem estava escrita três vezes |
| Templates sem cópia | front. 13 | paginação em 3 templates e 2 variantes divergentes |
| Paleta, números com nome, `<dialog>` | back. 17 · front. 14 | 54 cores soltas, `350` e `[1]` mágicos, `confirm()` nativo |
| Confirmação ao salvar | front. 15 | e um erro de exclusão que aparecia em verde, como sucesso |

Duas descobertas que valem mais que o código, ambas registradas com os números
medidos e com a tentativa errada que veio antes:

- **`REQUIRES_NEW` travando o pool** (back. 16). A correção "óbvia" da corrida
  fazia cada requisição segurar duas conexões; com o pool padrão de 10, vinte
  cadastros simultâneos travavam tudo. Trocada por `ON CONFLICT DO NOTHING`.
- **Um evento que não vem** (front. 14). O diálogo dependia do evento `close` do
  `<dialog>`, que não dispara em todo navegador. Redesenhado para não depender
  dele — e o redesenho eliminou um campo de estado.

### Terceira rodada — o mapa (tarefa 7)

Uma quarta tela, em `/imoveis/mapa`, com os imóveis desenhados sobre tiles do
OpenStreetMap. Detalhes em **back. 18** e **front. 16**.

| Tema | Em uma linha |
|---|---|
| Endpoint próprio | o mapa não cabe na listagem paginada: `GET /api/imoveis/mapa`, com teto de 500 no servidor |
| Envelope, não array | `pontos` + `total` + `truncado` — uma lista crua não consegue dizer que foi cortada, e a tela precisa avisar |
| Mesmos filtros | reusa o `ImovelSpecs` da listagem, para "buscar por proprietário" significar a mesma coisa nas duas telas |
| `circleMarker` em canvas | um `<canvas>` no lugar de um nó por imóvel, e nenhum asset de ícone para o bundler quebrar |
| Store sem herança | `MapaStore` não herda de `StorePaginado`: mapa não tem página 2, e herdar traria seis derivados presos em zero |
| UF de verdade | a validação aceitava duas letras quaisquer — `XX` entrava no banco. Agora são as 27, num enum |
| Filtro por estado e cidade | selects alimentados por `GROUP BY` no banco, com contagem; o enum valida, a consulta preenche |
| Acabamento visual | front. 18 — papel e tinta no lugar do cinza e do azul de framework, três raios, dois níveis de elevação e contraste AA medido |

Mais duas descobertas, no mesmo formato das duas acima:

- **Um enquadramento que não acontece** (front. 16). O mapa carregava os 12
  pontos e ficava parado no centro do Brasil, sem erro no console. O `fitBounds`
  faz um pan animado em `requestAnimationFrame`, agendado nos primeiros
  milissegundos de vida do mapa — se o navegador ainda não estiver compondo
  quadros, o pan nunca completa. Corrigido com `animate: false`, que também é o
  comportamento certo: no primeiro desenho não há transição a comunicar.
- **Um `<canvas>` órfão por filtro** (front. 16). O renderizador nascia dentro do
  redesenho, e `clearLayers()` não remove renderizador — só marcadores. Cada
  filtro aplicado abandonava um canvas do tamanho da viewport. Medido: cinco
  redesenhos, cinco canvas órfãos. Achado **ao medir**, não ao ler o código: não
  dá erro, não tem sintoma visível e não aparece com 12 imóveis.

A mesma medição respondeu onde está o peso do mapa: o canvas desenha 50 mil
pontos em 243 ms, mas os 6,9 MB de JSON que os trazem é que inviabilizam a tela.
O gargalo é o transporte, não o desenho — que é por que o teto vive no servidor.

### Quarta rodada — área real do lote (tarefa 8)

Detalhes em **back. 20** e **front. 19**.

| Tema | Em uma linha |
|---|---|
| Geometria derivada pelo banco | `geom` era coluna `GENERATED ALWAYS`, sem como divergir do ponto e das dimensões — *revisto na quinta rodada, ver abaixo* |
| Sem `hibernate-spatial` | nenhuma linha de Java manipula a geometria — o banco deriva, compara e devolve GeoJSON. **Continua valendo** |
| `ST_Overlaps`, não `ST_Intersects` | vizinhos que dividem a divisa dão interseção de área **zero** — *a condição foi corrigida na quinta rodada; ver back. 22* |
| Duas defesas | checagem exata na aplicação para a mensagem; `EXCLUDE USING gist` no banco para a corrida |

Duas descobertas, no formato das anteriores:

- **A trava do banco não pode ser exata** (back. 20). O `&&` compara *bounding
  boxes*, que o PostGIS guarda em `float4`; no *northing* UTM (~7,19 milhões) o
  passo é de **0,5 m**. Encolhimentos de 1 mm a 5 cm são invisíveis para ele e
  recusam vizinhos legítimos. A constraint ficou em 0,6 m, com a janela residual
  de ~1,2 m registrada em vez de escondida — número que a quinta rodada teve de
  rever quando lotes rurais apareceram (`V8`).
- **`@Generated` sobre `@Formula` não funciona** (back. 20). Era a correção
  idiomática para o polígono vir preenchido logo após o `INSERT`; o Hibernate monta
  um `SELECT` inválido e a gravação inteira falha. O campo saiu do
  `ImovelResponse` — melhor não expor do que expor um valor que mente na criação.

### Quinta rodada — polígono livre, CEP e CPF

Detalhes em **back. 21 a 23** e **front. 20 a 22**.

| Tema | Em uma linha |
|---|---|
| Lote desenhado no mapa | o contorno deixa de ser um retângulo alinhado aos eixos e passa a ser desenhado vértice a vértice, com lista dos pontos e área ao vivo |
| `geom` deixa de ser gerada | vira dado de entrada (`V7`), e duas `CHECK` repõem a garantia que a coluna gerada dava de graça: geometria válida e ponto dentro do próprio lote |
| Ainda sem `hibernate-spatial` | o polígono nunca vira objeto Java — sai como GeoJSON e o `ST_GeomFromGeoJSON` reprojeta na gravação |
| CEP pela BrasilAPI | preenche município, UF, bairro, rua e a coordenada da via; não é persistido |
| CPF identifica o proprietário | CPF já cadastrado liga o imóvel àquele registro em vez de criar outro, mesmo com o nome digitado diferente (`V9`) |

Três descobertas, no formato das anteriores:

- **`ST_Overlaps` aceitava lote dentro de lote** (back. 22). O operador exige que
  *nenhuma* das geometrias contenha a outra, então um lote desenhado inteiramente
  dentro de outro passava pela validação — quem recusava era a constraint, no
  commit, com mensagem genérica e sem o id do conflitante. Trocado por
  `ST_Intersects AND NOT ST_Touches`, que recusa contenção e continua aceitando
  vizinho de divisa.
- **O encolhimento de 0,6 m recusava vizinho legítimo** (back. 22). Medido com
  dois lotes de ~53 ha lado a lado: o gap real entre as geometrias encolhidas era
  de **0,189 m**, menor que o arredondamento de até 0,5 m que o índice faz em
  `float4`. A borda de um lote largo não é reta em UTM, e a curvatura come a
  folga. A `V8` levou o encolhimento a 1,5 m, assumindo por escrito o que se
  perde: a trava deixa de acusar sobreposições menores que ~3 m.
- **Editar apagava o lote** (front. 20). Abrir a edição de um imóvel com contorno
  desenhado e salvar sem tocar no mapa enviava `poligono: null`, que o backend
  entende como "apague a geometria". O formulário só era informado do polígono
  por ação do usuário, nunca pela carga.

A prévia de área do navegador e o valor gravado **não batem**, e o número está
registrado: 3.852,56 m² na tela contra 3.835,94 m² no PostGIS, 0,43%. A fórmula
do excesso esférico trata a Terra como esfera; o `ST_Area` projeta o elipsoide.
Por isso a tela chama aquilo de "área do desenho".

### Tecnologias acrescentadas

| Camada | O que entrou | Para que |
|---|---|---|
| Backend | Spring Data JPA (repositório + `Specification`) | eliminar SQL concatenado e habilitar filtros opcionais |
| Backend | Bean Validation (`spring-boot-starter-validation`) | validar a entrada na borda, com erro por campo |
| Backend | Lombok | getters da entidade sem boilerplate |
| Backend | **Flyway 11** + `pg_trgm` + `unaccent` | schema versionado e busca textual sem acento |
| Backend | `ProblemDetail` (RFC 7807) | formato padrão de erro |
| Backend | Perfil `dev` do Spring | `show-sql` e log `DEBUG` fora do padrão de produção |
| Frontend | **Signals** (`signal`, `computed`) | store em memória e estado reativo |
| Frontend | **Reactive Forms** | formulário tipado com validação |
| Frontend | Roteamento com `loadComponent` | uma página por tela, carregada sob demanda |
| Frontend | `strict` + `strictTemplates` | verificação de tipos, inclusive nos templates |
| Frontend | CSS custom properties | paleta em um lugar, no lugar de 54 cores soltas |
| Frontend | `<dialog>` nativo | confirmação com foco preso e Esc, sem reimplementar acessibilidade |
| Frontend | **IBM Plex** (Sans, Mono, Serif) | Mono dá algarismo de largura fixa a coordenada e área; Serif marca o wordmark |
| Frontend | **Leaflet 1.9** + tiles do **OpenStreetMap** | mapa dos imóveis, sem chave de API e sem servidor de tiles próprio |
| Backend | `ConstraintValidator` próprio (`@UfValida`) | restringir a UF às 27, sem repetir a lista na expressão regular |
| Backend | **PostGIS 3.6** — índice GiST e `EXCLUDE` | área real do lote, teste de sobreposição e a trava contra corrida no banco |
| Backend | `@CpfValido` — outro `ConstraintValidator` próprio | dígitos verificadores do CPF, sem repetir a regra na expressão regular |
| Frontend | **BrasilAPI** (`/api/cep/v2`) | endereço e coordenada a partir do CEP, sem chave de API |

### Estado das tarefas

| Tarefa | Estado |
|---|---|
| Parte 1 — revisão e refatoração | concluída, em duas rodadas (backend e frontend) |
| 1 — separar em duas páginas | concluída |
| 2 — filtros na listagem | concluída |
| 3 — página de edição (sem nova requisição ao voltar) | concluída |
| 4 — proprietário como entidade, com migração sem perda de dados | concluída |
| 5 — renomear proprietário refletindo em todos os imóveis | concluída |
| 6 — preparar para grande volume | concluída, com medição em 200 mil registros |
| 7 — mapa | concluída |
| 8 — polígonos georreferenciados sem sobreposição | concluída; o lote passou de retângulo derivado a contorno desenhado no mapa |

### O que ficou de fora

Cada `REFATORACAO.md` termina com a lista completa e o motivo de cada item. O
mais sério, nos dois lados, é o mesmo: **não há testes automatizados**. Toda a
refatoração foi validada por teste manual de API e verificação no navegador, com
os resultados registrados seção a seção.

## O exercício

O código está funcionando, mas **não está bom**.

### Parte 1 — revisão

1. Leia o backend e o frontend e **liste os problemas que você encontrar** —
   segurança, performance, arquitetura, manutenibilidade, boas práticas do
   Spring e do Angular.
2. Classifique cada problema por gravidade e explique **por que** é um problema.
3. **Refatore** o que você considerar mais crítico. Não é necessário corrigir
   tudo — é mais importante justificar as escolhas e a ordem de prioridade.

Use o sistema antes de ler o código. Cadastre alguns imóveis, edite, exclua.
O que acontece na tela nem sempre é o que aconteceu no banco.

### Parte 2 — tarefas

Hoje o sistema é uma tela só, com o formulário e a listagem juntos. As tarefas
abaixo evoluem isso. A ordem é sugerida, não obrigatória — se você preferir
outra, explique o porquê.

**Não é obrigatório entregar todos os exercícios mas explicar bem os que fez.**

**1. Separar em duas páginas**

Hoje o cadastro e a listagem dividem a mesma tela. Separe em duas páginas: uma
para **criar** o imóvel e outra para a **listagem**.

**2. Filtros na listagem**

A listagem precisa de filtro por **proprietário** e por **município**.

**3. Página de edição**

Crie uma terceira página, dedicada a editar o imóvel.

> **Requisito:** ao voltar da edição para a listagem, **não pode haver uma nova
> requisição**. A listagem deve reaproveitar os dados que já estavam em memória.

**4. Página de proprietários**

Hoje o proprietário é apenas um campo de texto dentro do imóvel. Modele o
proprietário como **entidade própria**, com **relacionamento** com o imóvel.

Com isso feito, crie uma página que lista os proprietários. Ao clicar em um
deles, mostrar os imóveis dos quais ele é dono.

> **Atenção aos dados existentes:** a base já tem imóveis cadastrados com o
> proprietário em texto. A migração não pode perdê-los.

**5. Renomear proprietário**

Deve ser possível **alterar o nome de um proprietário**.

> **Requisito:** se esse proprietário for dono de mais de um imóvel, a alteração
> precisa valer para **todos** os imóveis dele.

**6. Preparar a listagem para grande volume**

O seed local tem 12 imóveis, mas o cadastro real vai cobrir mais de mil
municípios — e muito mais imóveis do que isso. A listagem de hoje carrega e
renderiza tudo de uma vez, o que nesse cenário quebra dos dois lados: fica
**lenta** e vira uma tabela **impossível de usar**.

Faça as alterações necessárias para que a listagem se sustente com um grande
volume de dados, tanto no servidor quanto na interface. Diga o que você mediu ou
o que assumiu para chegar nas suas escolhas.

**7. Mapa (desejável mas não obrigatório)**

Crie uma tela com um mapa que permita visualizar os imóveis cadastrados.

Cada imóvel deve ser representado no mapa utilizando sua **latitude e longitude**.

Você pode utilizar a biblioteca de mapas que preferir. **OpenStreetMap**, **OpenLayers**, **Leaflet** ou outra solução equivalente são permitidas.

Não é necessário implementar funcionalidades avançadas de GIS. O objetivo é demonstrar que você consegue integrar uma biblioteca de mapas à aplicação, consumir os dados da API e representar informações geográficas na interface.

**Requisitos mínimos:**

- Exibir um mapa.
- Exibir os imóveis cadastrados como pontos no mapa.

**8. Desafio Opcional — imóveis georreferenciados sem sobreposição (nivel sênior)**

Hoje o imóvel guarda um ponto (`latitude`/`longitude`) e uma área solta em m².
A ideia aqui é passar a representar a **área real** do imóvel e garantir que dois
imóveis não ocupem o mesmo espaço.

No cadastro, o sistema recebe a posição geográfica (**latitude** e **longitude**)
e as dimensões (**largura** e **comprimento**). A partir disso, monte uma
geometria `POLYGON` com a área do imóvel e persista no banco.

Neste projeto as geometrias são armazenadas com **SRID 31982**:

```sql
geom public.geometry(POLYGON, 31982) NULL
```

Antes de inserir, verifique se o polígono gerado **intersecta ou sobrepõe** algum
imóvel já cadastrado. Se houver conflito, o cadastro é rejeitado e o usuário
recebe uma mensagem dizendo que a área selecionada conflita com outro imóvel.

Requisitos mínimos:

- Receber latitude, longitude, largura e comprimento.
- Gerar o polígono a partir desses dados.
- Persistir a geometria no banco.
- Impedir o cadastro quando houver sobreposição.
- Exibir no mapa os imóveis cadastrados.

Você tem liberdade total na abordagem: conversão das coordenadas, criação do
polígono, validação da geometria, consulta espacial e comunicação entre frontend
e backend. **PostGIS não é obrigatório** (extensão do postgres),  mas usá-lo conta como diferencial.

---

Não há uma única resposta certa. Queremos entender como você lê código que já
existe, como decide o que mexer primeiro, e como escreve código novo dentro de
uma base que você não escreveu. Explicar uma decisão vale mais do que entregar
todas as tarefas.

--- 

## Avaliação

Após concluir os projetos, tenha certeza de detalhar as tecnologias utilizadas em seus respectivos READMEs. Após isso, envie os links para os projetos no GitHub para o e-mail processoseletivo@maptriz.com.br.

A equipe técnica da Maptriz realizará um *Code Review* de seus projetos e, eventualmente, marcará uma reunião remota para discutir a sua solução dos desafios.

## Conclusão

Boa sorte no desafio! A equipe Maptriz deseja muito sucesso para você!
