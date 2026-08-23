# Refatoração do frontend

Registro das mudanças feitas no frontend, na ordem em que foram aplicadas, com a
justificativa de cada decisão.

**Stack:** Angular 22 · TypeScript 6 · RxJS 7.8 · Signals · Reactive Forms

Cobre as **tarefas 1, 2, 3, 4, 5 e 6** do enunciado — separar cadastro e listagem
em páginas distintas, filtros, página dedicada de edição, proprietários como
entidade com renomeação, e preparo para grande volume — e, no caminho, corrige a
maior parte dos problemas encontrados na revisão.

As seções seguem a **ordem cronológica** das mudanças, não a estrutura final do
código: onde uma decisão foi substituída depois, isso está anotado na própria
seção com o ponteiro para onde ela evoluiu.

---

## Sumário do diagnóstico

Toda a aplicação era **um componente só** (`Imoveis`, 123 linhas) acumulando
formulário, listagem, acesso HTTP e estado.

| # | Problema | Gravidade |
|---|---|---|
| 1 | `any` em todas as propriedades e retornos — TypeScript efetivamente desligado | 🔴 |
| 2 | `editar()` atribuía a **referência** do objeto da lista ao formulário | 🔴 |
| 3 | `subscribe` sem callback de erro — falha exibia mensagem de sucesso | 🔴 |
| 4 | URL da API repetida em 6 lugares | 🟠 |
| 5 | `HttpClient` chamado direto do componente | 🟠 |
| 6 | `subscribe` aninhado (`put` → `get`) em três blocos quase idênticos | 🟠 |
| 7 | `cdr.detectChanges()` manual após cada resposta | 🟠 |
| 8 | `totalArea()` invocado do template — recalculava a cada ciclo de render | 🟠 |
| 9 | Sem `<form>`, sem `<label>`, sem validação; `strict` desligado no tsconfig | 🟠 |
| 10 | Rota `**` apontando para a mesma tela — URL inválida indistinguível de válida | 🟡 |

O item 2 era o defeito visível ao usuário e a pista plantada no README ("o que
acontece na tela nem sempre é o que aconteceu no banco"): como o formulário e a
linha da tabela eram **o mesmo objeto**, digitar alterava a listagem ao vivo e
"Cancelar" não desfazia — a tela exibia dado editado que nunca chegou ao banco.

---

## Ordem das mudanças

| # | Etapa | Arquivos |
|---|---|---|
| 1 | Fundação tipada | `environments/`, `imovel.model.ts`, `tsconfig.json` |
| 2 | Camada de dados e store | `imovel.service.ts`, `mensagem-de-erro.ts` |
| 3 | Formulário compartilhado | `formulario/imovel-formulario.*` |
| 4 | Página de listagem | `lista/lista-imoveis.*` |
| 5 | Páginas de criação e edição | `novo/novo-imovel.*`, `editar/editar-imovel.*` |
| 6 | Rotas, shell e 404 | `app.routes.ts`, `app.*`, `nao-encontrado/` |
| 7 | Build e teste no navegador | — |
| 8 | Filtros e paginação (tarefas 2 e 6) | `pagina.model.ts`, `imovel.service.ts`, `lista/` |
| 9 | Proprietários (tarefas 4 e 5) | `proprietarios/`, `styles.scss` |

---

## 1. Fundação tipada

### `environment` com substituição em tempo de build

```ts
// environment.ts (produção)          apiUrl: '/api'
// environment.development.ts         apiUrl: 'http://localhost:8080/api'
```

O `angular.json` faz `fileReplacements` na configuração `development`. O código
importa sempre `environment.ts`; o Angular **troca o arquivo antes de compilar**.
Não existe `if (producao)` em runtime, e o bundle de produção sequer contém a URL
de desenvolvimento.

Produção usa caminho relativo porque o frontend costuma ser servido pela mesma
origem da API — funciona em qualquer domínio sem recompilar.

### Modelo — dois tipos espelhando os dois DTOs do backend

```ts
export interface Imovel { id, proprietario, ..., criadoEm, atualizadoEm }
export type ImovelPayload = Omit<Imovel, 'id' | 'criadoEm' | 'atualizadoEm'>;
```

`Omit` em vez de uma segunda interface escrita à mão: ele expressa a relação real
— *o payload é a resposta menos o que o servidor controla*. Um campo novo na API
entra no `Imovel` e aparece no `ImovelPayload` sozinho, sem risco de as duas
listas divergirem.

- `string | null` e não `| undefined`: o Jackson serializa campo ausente como
  `null`, não omitindo a chave. O tipo reflete o que chega pela rede.
- `criadoEm: string`: JSON não tem tipo de data. Declarar `Date` seria mentira.

### `strict` e `strictTemplates`

Ambos vêm ligados no `ng new` e haviam sido removidos deste projeto.
`strictTemplates` é o que faz o compilador verificar tipos **dentro do HTML**.

> Ligá-los não corrigiu nada retroativamente: `strict` proíbe `any` *implícito*, e
> o código antigo usava `any` *explícito*, que continua permitido. O ganho é no
> código novo — escrever `any` por descuido deixou de ser possível sem digitar a
> palavra.

---

## 2. `ImovelService` — HTTP e store em memória

É o arquivo central da entrega, porque é ele que cumpre o requisito da tarefa 3:
**voltar da edição para a listagem não pode disparar requisição.**

> Esta seção descreve a **primeira versão**, quando o store guardava a coleção
> inteira. A seção 8 documenta como ele evoluiu para guardar uma página, ao entrar
> filtros e paginação. O mecanismo do requisito continua o mesmo.

### Como o requisito é cumprido

**a) Uma única instância.** `providedIn: 'root'` faz as três páginas injetarem o
mesmo objeto e compartilharem o mesmo `_imoveis`. Fornecido no componente, cada
navegação criaria um store vazio e o requisito seria impossível.

**b) Carga condicional.**

```ts
carregarSeNecessario(): void {
  if (this._carregado() || this._carregando()) return;
  this.recarregar().subscribe();
}
```

A listagem chama isso no `ngOnInit` sempre. Na primeira visita busca; em toda
visita seguinte retorna sem fazer nada. A checagem de `_carregando` cobre duas
navegações rápidas antes da primeira resposta chegar.

**c) Escritas atualizam o store com a resposta do servidor.**

```ts
atualizar(id, payload) {
  return this.http.put<Imovel>(`${this.url}/${id}`, payload).pipe(
    tap(atualizado => this._imoveis.update(lista =>
      this.ordenar(lista.map(i => i.id === id ? atualizado : i)))));
}
```

Aqui está o retorno do que foi feito no backend: o `PUT` devolve o **recurso
atualizado**, e o service troca o item dentro do store por esse objeto. Quando a
navegação volta para a listagem, o dado novo já está lá.

Se o `PUT` ainda respondesse `{"status":"ok"}`, a única saída seria refazer o
`GET` — ou reconstruir o imóvel no cliente a partir do formulário, duplicando no
frontend regras que são do servidor (normalização de UF, timestamps).

### Contagem de requisições

| Fluxo | Antes | Depois |
|---|---|---|
| Abrir a listagem (1ª vez) | 1 `GET` | 1 `GET` |
| Ir para a edição | — (mesma tela) | **0** |
| Salvar uma edição | 1 `PUT` + 1 `GET` | 1 `PUT` |
| Voltar para a listagem | — | **0** |
| Excluir | 1 `DELETE` + 1 `GET` | 1 `DELETE` |
| Criar | 1 `POST` + 1 `GET` | 1 `POST` + 1 `GET` |

A criação é a única que manteve as duas chamadas — o motivo está na seção 8.

### Outras decisões

- **`asReadonly()`** — o sinal privado é gravável, o público não tem `.set()`.
  Nenhum componente escreve no store; só pede uma das operações nomeadas. É o
  mesmo princípio de ter removido os setters da entidade no backend.
- **`defer()`** na carga — sem ele, `_carregando.set(true)` executaria na
  **chamada**, não na **inscrição**. Um Observable devolvido e nunca inscrito
  deixaria a tela travada em "Carregando…" para sempre.
- **Erro assimétrico por intenção:** leitura reporta por estado (`catchError` →
  seta o sinal `erro`, retorna `EMPTY`), escrita propaga ao chamador. A página de
  criação **precisa** saber da falha para não navegar como se tivesse salvo — era
  exatamente o defeito do item 3.
- **`ordenar()`** replicava no cliente a ordem alfabética do backend, para um
  imóvel recém-criado não aparecer em posição que um F5 desmentiria. Esse método
  **foi removido no passo 8**: com paginação, reproduzir a ordenação localmente
  deixou de ser suficiente (o item pode pertencer a outra página), e a criação
  passou a recarregar.
- **`computed` para os agregados** — recalculam apenas quando o store muda, em vez
  de a cada ciclo de detecção como o `totalArea()` do template antigo.
- **`buscarPorId`** decide sozinho entre memória e rede: devolve `of(imovel)` se
  já estiver no store, senão faz `GET /api/imoveis/{id}`. A condicional fica no
  service, não espalhada pela UI.

### `mensagem-de-erro.ts`

Traduz a falha HTTP em frase para o usuário, consumindo o **ProblemDetail
(RFC 7807)** que o backend passou a devolver: erros por campo no `400`, código de
correlação no `500`, e mensagem específica para servidor fora do ar (`status 0`).

---

## 3. `ImovelFormulario` — componente compartilhado

Recebe um imóvel (ou nada, para criação) e **emite o payload pronto**. Não injeta
`HttpClient`, não injeta `Router`, não conhece o service. Quem grava e quem navega
são as páginas.

É o que permite criação e edição compartilharem a mesma definição de campos e
validações — dois formulários separados divergiriam na primeira mudança.

### O bug do item 2 morre por construção

```ts
effect(() => {
  const imovel = this.imovel();
  if (!imovel) return;
  this.form.setValue({ proprietario: imovel.proprietario, ... });
});
```

`setValue` **copia valor por valor**. O `FormGroup` guarda strings e números
próprios; não existe caminho de volta até o objeto do store.

Não foi corrigido com um `{ ...i }` no lugar certo — o bug some porque o
formulário **não tem como** referenciar o objeto original.

### Tipagem dos controles

```ts
proprietario: new FormControl('', { nonNullable: true, ... })
latitude:     new FormControl<number | null>(null, { ... })
```

Strings são `nonNullable` (o vazio natural é `''`). Números **não podem ser**, e
o motivo é do domínio: **`0` é uma latitude válida**. Se o campo abrisse com `0`,
o formulário viria pré-preenchido com uma coordenada real e o `required` passaria
sem ninguém digitar nada. `null` é o único valor que significa "não informado"
sem colidir com dado legítimo.

### Estreitamento em vez de `!`

```ts
if (valores.latitude === null || valores.longitude === null) return;
```

O `required` já garante que isso não acontece. `valores.latitude!` economizaria
quatro linhas, mas `!` é uma promessa ao compilador — e promessas envelhecem: se
alguém remover o `required` amanhã, o `!` continua lá mentindo. O `return` faz o
compilador **provar** o tipo em vez de acreditar.

### Botão de submit **não** desabilitado quando o formulário é inválido

Desabilitar é o reflexo comum e é pior: o usuário clica, nada acontece, e ele não
descobre qual campo está errado. Aqui o clique dispara `markAllAsTouched()` e
todas as mensagens aparecem de uma vez. Desabilita-se apenas durante o
salvamento, para evitar duplo envio.

### Validação agora em três camadas

| Onde | Papel |
|---|---|
| `ImovelFormulario` | feedback imediato, sem ida ao servidor |
| `ImovelRequest` (backend) | contrato da API, `400` com erro por campo |
| `Endereco` / `Coordenada` (backend) | integridade do dado, venha de onde vier |

A regra é a mesma; o raio de ação, não. O formulário protege **este** usuário, o
DTO protege a **API**, o value object protege o **dado**.

---

## 4. `ListaImoveis`

- **`@for` com `track imovel.id`** — o `*ngFor` sem `trackBy` recriava todas as
  `<tr>` a cada atualização.
- **View model pré-calculado**: um `computed` monta `{ imovel, endereco }` uma vez
  por mudança do store. O `endereco(i)` do template antigo executava a cada ciclo
  de render, para cada linha.
- **Estados explícitos**: carregando, erro (com "Tentar novamente"), lista vazia e
  lista com dados são ramos distintos, não um `*ngIf` solto.
- **Acessibilidade**: `<th scope="col">`, `aria-label` individual em cada botão
  ("Excluir imóvel de Ana Beatriz Lima" em vez de doze botões "Excluir"
  indistinguíveis), `role="alert"` nas mensagens.
- **`takeUntilDestroyed(destroyRef)`** em toda inscrição — se o componente for
  destruído durante a requisição, o callback não roda sobre um componente morto.
- **`ChangeDetectionStrategy.OnPush`** em todos os componentes. Com signals, o
  `cdr.detectChanges()` manual deixou de ser necessário: ele era sintoma, não
  solução.

---

## 5. `NovoImovel` e `EditarImovel` — páginas reais

Rotas de verdade, não modais. Isso significa URL compartilhável, F5 funcionando
no meio da edição, botão voltar do navegador nativo e título de documento por
página (via `title` na rota).

Ser página real cria um caso que modal não teria: alguém pode abrir
`/imoveis/5/editar` com a aplicação recém-carregada e o store vazio. Daí os dois
caminhos, ambos resolvidos dentro de `buscarPorId`:

| Entrada | Store | Comportamento |
|---|---|---|
| Clicou em "Editar" na listagem | populado | lê da memória, **0 requisições** |
| Abriu a URL direto / F5 | vazio | `GET /api/imoveis/5` |
| Voltou da edição para a listagem | já atualizado pelo `PUT` | **0 requisições** |

Ambas as páginas navegam **apenas dentro do callback `next`**. Em caso de erro,
permanecem na tela exibindo a mensagem vinda do backend.

---

## 6. Rotas, shell e 404

```ts
{ path: '',                    redirectTo: 'imoveis', pathMatch: 'full' }
{ path: 'imoveis',             loadComponent: ... }
{ path: 'imoveis/novo',        loadComponent: ... }
{ path: 'imoveis/:id/editar',  loadComponent: ... }
{ path: '**',                  loadComponent: NaoEncontrado }
```

Antes, as três rotas (inclusive o curinga) apontavam para o mesmo componente —
`/qualquer-coisa-errada` renderizava a listagem com status de sucesso.

**`loadComponent`** carrega cada página sob demanda. O resultado no build:

```
main.js          7,42 kB   (shell + roteador)
lista-imoveis   18,36 kB   (lazy)
novo-imovel      5,31 kB   (lazy)
editar-imovel    8,68 kB   (lazy)
```

Abrir a listagem não baixa o código do formulário de cadastro.

Também entrou o **locale pt-BR** (`registerLocaleData` + `LOCALE_ID`), para o
`DecimalPipe` formatar `3.716,70` em vez de `3,716.70`.

---

## 7. Verificação no navegador

Testes executados com a aplicação rodando contra o backend real:

| Cenário | Resultado |
|---|---|
| Listagem inicial | 12 imóveis, "área total 3.716,70 m²" (formatação pt-BR) |
| Clicar em "Editar" | navegou para `/imoveis/3/editar`, **0 requisições** |
| Formulário na edição | preenchido a partir da memória |
| Salvar a edição | **exatamente 1 `PUT`**, nenhum `GET` |
| Voltar à listagem | **0 requisições**, nome atualizado e **reordenado** |
| F5 em `/imoveis/3/editar` | `GET /api/imoveis/3` (store vazio) |
| Submeter formulário vazio | 5 mensagens de erro, **0 requisições**, sem navegar |
| `aria-label` dos botões | "Editar imóvel de Ana Beatriz Lima" |

---

## 8. Filtros e paginação (tarefas 2 e 6)

A API passou a devolver um envelope paginado em vez de um array, e o frontend
acompanhou.

### O store passou a guardar uma página, não a coleção

```ts
private readonly _resultado = signal<Pagina<Imovel> | null>(null);
private readonly _filtro = signal<FiltroImoveis>(FILTRO_VAZIO);
private readonly _tamanho = signal<number>(20);
```

Os sinais derivados (`imoveis`, `pagina`, `totalDeItens`, `primeiraPagina`, …)
são `computed` sobre esse resultado, então a tela nunca lê a estrutura crua.

### O requisito da tarefa 3 continua valendo — com uma exceção deliberada

| Operação | Comportamento | Motivo |
|---|---|---|
| **Editar** | substitui o item na página em memória | é o requisito: voltar da edição não pode buscar |
| **Excluir** | remove da página e decrementa o total | o que o usuário vê corresponde ao que ele fez |
| **Criar** | **recarrega a página** | com filtro e ordenação alfabética não há como saber em que página o novo imóvel caiu |

O caso da criação é uma escolha consciente: inserir o item no array local
mostraria a lista numa ordem que um `F5` desmentiria. Preferi uma requisição a
uma tela que mente.

**Tensão registrada na edição:** se o usuário renomear um imóvel de forma que ele
deixe de casar com o filtro ativo, ele continua visível até a próxima busca.
Corrigir isso exigiria refazer o `GET` — exatamente o que o enunciado proíbe. O
requisito e a consistência perfeita são incompatíveis aqui, e o enunciado escolheu
o requisito.

### Debounce no filtro

```ts
this.filtroForm.valueChanges.pipe(
  debounceTime(350),
  distinctUntilChanged((a, b) => a.proprietario === b.proprietario && a.municipio === b.municipio),
  takeUntilDestroyed(this.destroyRef),
)
```

Sem `debounceTime`, digitar "goiania" dispararia **7 requisições**. Medido no
navegador: com ele, **1**.

O `distinctUntilChanged` cobre o caso de o texto voltar ao valor anterior (digitar
e apagar), que emitiria de novo sem ter mudado nada.

### O filtro sobrevive à navegação

```ts
ngOnInit(): void {
  this.filtroForm.setValue(this.service.filtro(), { emitEvent: false });
  this.service.carregarSeNecessario();
}
```

O filtro mora no service, não no componente — então voltar da edição repõe o
texto nos campos. O `emitEvent: false` é essencial: sem ele, essa escrita
dispararia o `valueChanges` e provocaria justamente a requisição que o requisito
proíbe.

### "Área total" virou "área desta página"

Com paginação, somar apenas o que está na tela e chamar de "total" seria mentira.
O rótulo mudou junto com o comportamento. Um total verdadeiro exigiria uma
consulta de agregação dedicada no backend — não implementada por não ter sido
pedida.

### Seletor de itens por página

10 / 20 / 50, com o backend limitando a 100 (`max-page-size`). Trocar o tamanho
volta para a primeira página, porque a posição anterior deixa de fazer sentido.

---

## Verificação no navegador — tarefas 2 e 6

| Cenário | Resultado |
|---|---|
| Digitar "goiania" no filtro de município | 1 resultado ("Goiânia") — **sem acento encontra com acento** |
| Requisições para 7 teclas digitadas | **1** (debounce) |
| Selecionar 10 itens por página | 10 linhas, "Página 1 de 2" |
| Clicar em "Próxima" | "Página 2 de 2", botão desabilitado corretamente |
| Com filtro ativo, entrar na edição | **0 requisições** |
| Salvar e voltar | **1 requisição** (o `PUT`), filtro `lima` preservado, linha atualizada |

---

## 9. Páginas de proprietários (tarefas 4 e 5)

Duas telas novas, em `src/app/proprietarios/`:

| URL | Componente | O que faz |
|---|---|---|
| `/proprietarios` | `ListaProprietarios` | lista com contagem de imóveis, filtro e renomeação inline |
| `/proprietarios/:id/imoveis` | `ImoveisDoProprietario` | os imóveis daquele dono |

### Store próprio, separado do de imóveis

`ProprietarioService` tem o próprio `_resultado`. Compartilhar o store de
`ImovelService` faria a listagem de proprietários **invalidar a página e o filtro**
que o usuário deixou na listagem principal.

Pelo mesmo motivo, `imoveisDoProprietario()` devolve um `Observable` e a página
guarda o resultado localmente, em vez de escrever no store global.

### Reaproveita o endpoint de imóveis

"Imóveis deste proprietário" é `GET /api/imoveis?proprietarioId=7` — o mesmo
recurso, restrito — em vez de uma rota aninhada `/proprietarios/7/imoveis` no
backend. Menos superfície de API para o mesmo resultado.

### Renomeação inline

A linha vira um formulário no lugar, sem modal e sem página nova: é uma edição de
campo único, e tirar o usuário da lista para isso seria desproporcional.

Após salvar, o aviso diz **quantos imóveis foram afetados** — usando o
`quantidadeDeImoveis` que vem na resposta. É a confirmação visível do requisito
da tarefa 5.

Conflito de nome devolve `409` do backend e aparece como mensagem no próprio
formulário, sem perder o que foi digitado.

### Um bug encontrado testando

O primeiro `<form (ngSubmit)="...">` **não tinha `[formGroup]`**, e o componente
só importava `ReactiveFormsModule`. Sem uma diretiva de formulário ligada,
`ngSubmit` não existe — o navegador fazia o **submit nativo e recarregava a
página**, perdendo todo o estado.

A correção foi envolver os campos em `FormGroup`, mesmo o filtro que tem um campo
só: é a `FormGroupDirective` que fornece o `ngSubmit`.

### Duplicação de CSS removida

Botões, tabela, filtros, estados e paginação estavam repetidos em cada página.
Foram para `src/styles.scss` como vocabulário visual compartilhado; os arquivos
de componente ficaram apenas com o que é específico deles — `lista-imoveis.scss`
caiu de 90 para 15 linhas.

---

## 10. `core/` — o que não pertence a nenhuma feature

Mesmo diagnóstico da seção 15 do backend, do outro lado da fronteira.

Dois módulos genéricos moravam dentro de `imoveis/`, porque foi ali que nasceram:

| Arquivo | Quem importava de fora de `imoveis/` |
|---|---|
| `imoveis/pagina.model.ts` (`Pagina<T>`) | `proprietario.service.ts`, `imoveis-do-proprietario.ts` |
| `imoveis/mensagem-de-erro.ts` | `lista-proprietarios.ts`, `imoveis-do-proprietario.ts` |

O resultado eram imports que atravessam a fronteira sem nenhuma razão de domínio:

```ts
// ...dentro de proprietarios/
import { Pagina } from '../imoveis/pagina.model';
import { mensagemDeErro } from '../../imoveis/mensagem-de-erro';
```

Ler isso sugere que proprietários dependem de imóveis. Não dependem: o que eles
usam é o formato de página devolvido pela API e o tradutor de
`HttpErrorResponse` — e nenhum dos dois é sobre imóveis. Os dois foram para
`src/app/core/`.

Na direção oposta, o mesmo `pagina.model.ts` carregava `FiltroImoveis` e
`FILTRO_VAZIO`, que são **específicos** de imóveis, dentro de um arquivo de nome
genérico. Foram para `imoveis/filtro.model.ts`, espelhando o `ImovelFiltro` do
backend.

`TAMANHOS_DE_PAGINA` ficou em `core/pagina.model.ts`: é a lista de opções de
"itens por página" das listagens, não uma decisão sobre imóveis.

**Resultado:** `proprietarios/` deixou de importar de `imoveis/` — com uma
exceção deliberada, o tipo `Imovel`, usado por `proprietario.service.ts` ao
reaproveitar `GET /api/imoveis?proprietarioId=`. Essa é uma relação de domínio
real, e por isso continua explícita no código.

---

## 11. Contrato honesto — `ImovelPayload` por extenso

`ImovelPayload` era derivado do modelo de resposta:

```ts
export type ImovelPayload = Omit<Imovel, 'id' | 'criadoEm' | 'atualizadoEm'>;
```

O comentário original justificava a escolha como economia: "para que um campo
novo na resposta não precise ser repetido aqui à mão". O efeito era o oposto —
um campo novo na **resposta** virava campo obrigatório no corpo do **envio**.

E isso já cobrava um preço silencioso. O backend devolve `proprietarioId` desde
a tarefa 4:

```json
{"id":3,"proprietarioId":7,"proprietario":"Ana Beatriz Lima", ...}
```

...mas a interface `Imovel` não declarava esse campo. Não por descuido:
declará-lo quebraria `ImovelPayload`, porque o `ImovelRequest` do backend não
aceita `proprietarioId` — ele resolve o proprietário pelo **nome** (seção 14 do
`REFATORACAO.md` do backend). O tipo "esperto" estava impedindo o modelo de
dizer a verdade sobre a API.

Entrada e saída são dois contratos independentes que hoje quase coincidem.
Amarrá-los faz a evolução de um quebrar o outro. `ImovelPayload` passou a ser
uma `interface` declarada por extenso, espelhando o `ImovelRequest`; `Imovel`
ganhou o `proprietarioId` que faltava, espelhando o `ImovelResponse`.

Dez linhas repetidas custam menos que dois contratos amarrados.

### Um comentário que contradizia o código

Em `NovoImovel`:

```ts
// Navega apenas no sucesso. O store já recebeu o imóvel criado,
// então a listagem o exibe sem nova requisição.
```

Falso. `ImovelService.criar` recarrega de propósito, e explica o porquê na
própria implementação: com filtro e ordenação alfabética não há como saber em
que página o imóvel novo caiu. O comentário fora copiado de `EditarImovel`, onde
**é** verdade — lá o `PUT` devolve o item e o store o substitui no lugar.

Comentário errado é pior que comentário nenhum: quem lê passa a contar com uma
otimização que não existe. Corrigido para descrever o que o código faz, com
ponteiro para onde a decisão está justificada.

### Verificação

| Fluxo | Requisições ao backend |
|---|---|
| Listagem → Editar → Salvar → volta | `PUT /api/imoveis/3`, e nada mais |
| URL direta `/imoveis/3/editar` → Salvar → volta | `GET /api/imoveis/3`, `PUT`, `GET` da listagem |

A segunda linha não é regressão: entrando pela URL o store nasce vazio, então a
listagem precisa da primeira carga. O requisito da tarefa 3 fala de **voltar** da
edição — é a primeira linha.

---

## 12. `StorePaginado<T>` — a mesma listagem escrita três vezes

`ImovelService` e `ProprietarioService` nasceram separados, em momentos
diferentes (seções 2 e 9), e chegaram cada um por seu caminho exatamente à mesma
forma:

- uma página em memória (`_resultado`), mais `_carregando` e `_erro`;
- os mesmos seis derivados — `pagina`, `totalDePaginas`, `totalDeItens`,
  `primeiraPagina`, `ultimaPagina` e a lista de itens;
- `carregarSeNecessario()`, `irParaPagina()`, `recarregar()`;
- o mesmo pipeline `defer → tap → catchError → finalize`.

Eram cerca de 60 linhas idênticas em dois arquivos. Pior: a **terceira** listagem
— imóveis de um proprietário — já estava copiando a mesma coisa uma vez mais,
dessa vez dentro do componente, com `resultado` e os mesmos `computed` escritos à
mão.

Três cópias é o sinal de que a forma existe e ainda não tinha nome.

### O que ficou na base e o que ficou em cada filha

`core/store-paginado.ts` guarda a mecânica. Cada subclasse declara só o que
realmente difere:

```ts
protected abstract readonly url: string;
protected abstract readonly mensagemDeFalha: string;
protected abstract montarParametros(numeroDaPagina: number): HttpParams;
```

`T extends { id: number }` porque substituir e remover item da página em memória
são operações comuns às listagens e ambas precisam identificar a linha — todos os
recursos desta API têm `id`. Isso eliminou de quebra a cópia manual de
`substituirNaPagina` que existia dentro do `ProprietarioService.renomear`.

O `_resultado` continua **privado na base**: as filhas mexem na página pelos
métodos `substituirNaPagina` / `removerDaPagina`, nunca no sinal direto.

### A terceira listagem virou store de componente

`ImoveisDoProprietarioStore` estende a mesma base, mas **sem**
`providedIn: 'root'` — é declarado em `providers` do componente. Cada visita à
tela nasce com estado limpo e sair dela o descarta; um singleton guardaria a
página de um proprietário para mostrar ao próximo.

É também o que mantém a decisão da seção 9: não usar o `ImovelService` aqui,
porque sobrescrever aquele store faria a listagem principal perder a página e o
filtro que o usuário deixou lá. Antes isso custava um método avulso
(`imoveisDoProprietario`) no `ProprietarioService`, que não tinha nada a ver com
proprietários; agora é um store próprio, no lugar certo.

### Os componentes pararam de copiar o store

Os três componentes de listagem abriam com um bloco assim:

```ts
private readonly service = inject(ImovelService);

readonly carregando = this.service.carregando;
readonly erroDeCarga = this.service.erro;
readonly totalDeItens = this.service.totalDeItens;
readonly pagina = this.service.pagina;
// ...mais cinco
```

Esses apelidos não acrescentavam nada — existiam **só** porque `service` era
`private` e o template não conseguia enxergá-lo. Trocando para `protected`, o
template lê `service.pagina()` direto e as nove linhas somem. O template também
fica mais honesto: fica visível de onde cada valor vem.

O que continuou no componente é o que é **do componente**: `linhas` (endereço
formatado), `aviso`, `excluindoId`, os formulários, e os métodos que limpam o
aviso antes de delegar.

### Verificação no navegador

Tudo exercitado com a rede monitorada, com os 12 registros do seed:

| O quê | Resultado |
|---|---|
| Itens por página 20 → 10 | 10 linhas, "Página 1 de 2" |
| "Próxima ›" | 2 linhas, "Página 2 de 2", botões de avanço desabilitados |
| Filtro município = `sao paulo` | 2 resultados (acha "São Paulo"), volta para a página 1, aparece "Limpar filtros" |
| Renomear proprietário | `PUT` e nada mais — linha trocada em memória |
| Imóveis do proprietário (vindo da lista) | só `GET /api/imoveis?proprietarioId=7` — o nome veio da memória |
| Outro proprietário pela URL | estado limpo, sem vazar o anterior |
| `/proprietarios/abc/imoveis` | "Identificador de proprietário inválido." |
| `/proprietarios/99999/imoveis` | "Proprietário 99999 não encontrado" |
| Listagem → Editar → Salvar → volta | **só o `PUT`** — requisito da tarefa 3 intacto |

Build de produção com `strictTemplates`: sem erros.

---

## 13. Templates sem cópia — `<app-paginacao>`, pipes e `enderecoDoImovel`

A seção 12 tirou a duplicação dos stores. O que sobrou dela estava nos templates.

### A paginação estava em três lugares, e em duas versões

O bloco `<nav class="paginacao">` aparecia nos três templates. Pior que a
repetição: as versões **divergiam**. A de imóveis tinha « Primeira e Última »,
as outras duas tinham só ‹ Anterior e Próxima ›.

Isso não era decisão de ninguém. Foi o segundo template ter sido escrito a partir
de uma versão antiga do primeiro — o tipo de diferença que ninguém escolhe e
todo mundo herda.

`core/paginacao/paginacao.ts` unifica: uma variante só, e as três telas passam a
ter os quatro botões.

Duas decisões dentro dele:

- **`primeira` e `ultima` são derivados, não recebidos.** A API devolve os dois
  campos, mas passá-los como entrada abriria a chance de discordarem de `pagina`
  e `totalDePaginas` — dois botões desabilitados no meio da lista, sem
  explicação. Com o cálculo interno isso é impossível por construção.
  Consequência: os derivados `primeiraPagina` / `ultimaPagina` do
  `StorePaginado` ficaram órfãos e foram removidos. `Pagina<T>` continua
  declarando os campos, porque a resposta continua trazendo.

- **O componente decide sozinho se aparece.** O `@if (totalDePaginas() > 1)`
  mora dentro dele; sem isso as três telas repetiriam o mesmo `@if` em volta —
  trocar uma duplicação por outra.

A chamada ficou:

```html
<app-paginacao [pagina]="service.pagina()" [totalDePaginas]="service.totalDePaginas()"
               (irPara)="irParaPagina($event)" />
```

### Dois formatos escritos à mão nas duas tabelas

```html
{{ linha.imovel.areaM2 === null ? '—' : (linha.imovel.areaM2 | number:'1.2-2') }}
{{ linha.imovel.ativo ? 'Sim' : 'Não' }}
```

Viraram `| area` e `| simNao`. O `AreaPipe` usa `formatNumber` com o
`LOCALE_ID` da aplicação, então não precisa que `DecimalPipe` seja provido em
lugar nenhum. O travessão importa: deixar o `number` cuidar do nulo mostraria
célula vazia, e trocar por zero mentiria — terreno sem medida não é terreno de
0 m². O resumo do topo (`áreaDaPagina`) passou a usar o mesmo pipe, para as duas
áreas da tela serem formatadas pela mesma regra.

### `enderecoDoImovel`

Estava duplicado, idêntico, em `ListaImoveis` e `ImoveisDoProprietario`. Foi para
`imoveis/endereco-do-imovel.ts`, junto do modelo — é leitura do imóvel, não
decisão de tela.

Continua **função**, e não pipe, de propósito: as duas telas o chamam dentro de
um `computed`, então o endereço é formatado uma vez por mudança do store e não a
cada ciclo de renderização.

### Verificação no navegador

Como o seed tem 12 registros e nenhuma das telas paginava com ele, foram criados
37 imóveis e 13 proprietários temporários só para a verificação, removidos ao
final (base de volta em 12/12).

| Tela | Resultado |
|---|---|
| `/imoveis`, 25 registros, tamanho 10 | "Página 1 de 2", « e ‹ desabilitados; "Última »" leva a "Página 2 de 2" com › e » desabilitados |
| `/proprietarios`, 25 proprietários | ganhou os quatro botões (antes tinha dois); "Última »" funciona |
| `/proprietarios/93/imoveis`, 25 imóveis | store de componente paginando, "Próxima ›" leva à página 2 |
| Imóvel sem área e sem logradouro | `—` nas duas colunas, pelos pipes e por `enderecoDoImovel` |

Efeito colateral mensurável no build: `lista-imoveis` caiu de 26,99 kB para
23,14 kB, `lista-proprietarios` de 25,14 para 23,32 e `imoveis-do-proprietario`
de 16,77 para 14,77 — o que saiu dos três virou um chunk compartilhado.

---

## 14. Polimento — paleta, números com nome e o fim do `confirm()`

### 54 cores viraram uma paleta

Eram 54 valores hexadecimais espalhados por oito arquivos, com o mesmo cinza
reescrito em cinco lugares. Trocar a cor da marca significava caçar `#34495e`
arquivo por arquivo e torcer para não esquecer nenhum.

Agora existe um `:root` em `styles.scss` com a paleta nomeada por **função**
(`--cor-texto-suave`, `--cor-erro-fundo`, `--cor-marca`), não por aparência
(`--cinza-claro`) — nome de aparência envelhece mal na primeira mudança de tema.

Custom properties do CSS, e não variáveis do Sass: as do Sass somem na
compilação; estas continuam no navegador, dá para inspecionar no devtools e são
o caminho natural para um tema alternativo.

Uma coisa que a paleta **expôs**: `--cor-erro-texto` (`#922b21`) e
`--cor-erro-campo` (`#c0392b`) são dois vermelhos quase idênticos. A diferença
nunca foi decisão de ninguém — nasceu de dois arquivos escritos em momentos
diferentes. Ficaram os dois, com um comentário: unificar é decisão de design, não
de refatoração.

### Regras inteiras duplicadas, não só cores

Ao mexer nos arquivos ficou visível que a duplicação ia além das cores:

| Regra | Estava em | Situação |
|---|---|---|
| `.botao`, `.botao--primario`, `.botao:disabled` | `imovel-formulario.scss`, `editar-imovel.scss` | reescritas, com o `styles.scss` já tendo as três |
| `.campo__erro` | `imovel-formulario.scss` | idêntica à global |
| `.trilha` e `.trilha a` | `novo-imovel`, `editar-imovel`, `imoveis-do-proprietario` | idênticas nas três |
| `h2 { margin; font-size }` | `novo-imovel`, `editar-imovel` | idênticas |
| estilo de input | `.filtros__campo input`, `.campo input`, `.renomear input`, `.resumo__tamanho select` | a mesma aparência quatro vezes |
| `:focus-visible` | três arquivos | idêntica |

Estilo global aplica dentro de componente (encapsulação isola o que sai, não o
que entra), então as cópias locais eram puro peso — venciam a global por ordem
de declaração e diziam a mesma coisa.

O input virou regra **por tipo** no global:

```scss
input[type="text"], input[type="search"], input[type="number"], select { … }
```

Listar os tipos um a um deixa o checkbox de fora naturalmente — verificado: ele
continua com `padding: 0` e largura nativa.

Duas exceções ficaram, como delta explícito e comentado: o `select` do "itens por
página" é menor de propósito, e o `.botao` de `editar-imovel` precisa de
`margin-top` porque aparece solto abaixo da mensagem de erro.

Também houve uma correção de template: `novo-imovel.html` e `editar-imovel.html`
usavam `class="estado--erro"` **sem** `estado` — e era por isso que precisavam
redeclarar padding e fundo. Passaram a usar `class="estado estado--erro"`, como as
outras telas, e as regras locais caíram sozinhas.

`novo-imovel.scss` e `imoveis-do-proprietario.scss` ficaram sem nenhuma regra.

### Números com nome

- `debounceTime(350)` estava escrito à mão nos dois formulários de filtro. Virou
  `ESPERA_DO_FILTRO`, em `core/interacao.ts`, com o porquê do valor registrado.
- `TAMANHOS_DE_PAGINA[1]` — indexar por posição para dizer "o padrão" é frágil e
  ilegível. Virou `TAMANHO_DE_PAGINA_PADRAO`, e `TAMANHOS_DE_PAGINA` passou a ser
  montado a partir dele. O comentário registra que ele espelha o
  `@PageableDefault(size = 20)` do backend: se os dois discordarem, a primeira
  página vem de um tamanho e as seguintes de outro.

### `confirm()` → `<dialog>`

O `confirm()` nativo trava a thread, não é estilizável e é **suprimível pelo
navegador** — e, quando suprimido, devolve `false` em silêncio: o botão de
excluir simplesmente pararia de funcionar, sem erro nenhum.

O `<dialog>` nativo foi escolhido em vez de uma `<div>` com overlay porque já traz
foco preso, Esc, `aria-modal` e o resto da página inerte. Verificado no
navegador: `:modal` verdadeiro e foco movido para dentro sozinho.

O fluxo virou um sinal: `aExcluir` guarda o imóvel aguardando confirmação, o
`@if` mostra o diálogo, e `confirmado` / `cancelado` decidem o resto.

**Um erro no caminho, que vale registrar.** A primeira versão tinha uma única
saída — o evento `close` do `<dialog>` — e um campo `confirmou` para lembrar quem
tinha pedido o fechamento. Na verificação, o `close()` **não disparou o evento
`close`** neste navegador: o diálogo fechava visualmente (`open=false`) e o
componente nunca era removido. O binding do Angular estava certo (despachando o
evento à mão, tudo funcionava) — o problema era depender de um evento que não veio.

A segunda versão não depende dele: cada saída avisa por si, e o Esc entra pelo
evento `cancel`, que é o específico dele. De quebra o campo `confirmou`
desapareceu — ele só existia para desambiguar a saída única.

### Verificação

| Caminho | Resultado |
|---|---|
| Esc (evento `cancel`) | diálogo sai, imóvel **não** é excluído, contagem 13 |
| Botão "Cancelar" | idem |
| Botão "Excluir" | `DELETE`, contagem 13 → 12, aviso "Imóvel de … excluído." |
| Estilos computados, antes × depois | `--cor-marca` = `rgb(52,73,94)`, `th` = `rgb(238,238,238)`, filtros = `rgb(250,250,250)` / borda `rgb(221,221,221)`, input = `6px 8px` / `rgb(204,204,204)` / `14px` — idênticos aos valores originais |

---

## 15. Confirmação ao cadastrar e editar — e um erro que se passava por sucesso

Cadastrar e editar já mostravam **erro** na própria tela do formulário, com o
`ProblemDetail` traduzido pelo `mensagemDeErro`. O que faltava era a
confirmação: o usuário salvava, era jogado na listagem e tinha que procurar a
linha para saber se deu certo.

Isso estava registrado como decisão consciente na tabela "o que ficou de fora":
a linha aparecendo já seria o feedback. Na prática não é — com filtro ativo e
ordenação alfabética, o imóvel novo pode cair em outra página e sumir da vista.

### Um defeito encontrado no caminho

Ao mexer no assunto, apareceu algo pior que a ausência de mensagem. A listagem
tinha **um único** `aviso: signal<string | null>`, e a exclusão usava ele para as
duas coisas:

```ts
next:  () => this.aviso.set(`Imóvel de ${imovel.proprietario} excluído.`),
error: erro => this.aviso.set(mensagemDeErro(erro)),
```

O template renderizava esse slot sempre como `estado--aviso`, com
`role="status"`. Ou seja: **uma falha ao excluir aparecia em verde**, no mesmo
lugar e com o mesmo estilo de um sucesso — e anunciada a leitores de tela como
status, não como alerta. Quem lesse rápido concluiria que o imóvel foi excluído.

O slot virou tipado:

```ts
export interface Mensagem {
  texto: string;
  tom: 'sucesso' | 'erro';
}
```

e o template escolhe classe e `role` pelo tom. O erro agora sai em vermelho, com
`role="alert"`.

### Atravessar a troca de rota

O componente que sabe o que aconteceu (`NovoImovel`, `EditarImovel`) é destruído
na navegação, antes de poder mostrar qualquer coisa. A mensagem precisa
sobreviver ao trajeto.

`AvisoEntreRotas` é uma caixa de uso único: quem publica, publica antes de
navegar; a listagem lê no `ngOnInit` e **esvazia**.

Não usa o `state` do Router de propósito. Aquilo vive no `history.state` e
sobrevive ao F5 — a mensagem "Imóvel cadastrado" reapareceria a cada recarga da
listagem, muito depois do cadastro. Verificado: com esta implementação, um F5
depois do cadastro não traz a mensagem de volta.

### O texto vem da resposta, não do formulário

```ts
next: criado => {
  this.avisoEntreRotas.publicar({
    texto: `Imóvel de ${criado.proprietario} cadastrado.`,
    tom: 'sucesso',
  });
  ...
```

Quem decide o nome do proprietário é o servidor: o `ResolverProprietario`
reaproveita um registro existente quando o nome já é conhecido, com a grafia que
já estava lá. Verificado digitando `"  ana beatriz lima  "` no formulário — a
confirmação voltou com **"Imóvel de Ana Beatriz Lima cadastrado."**. Se o texto
saísse do payload, a mensagem afirmaria uma grafia que não foi gravada.

### Verificação

| Caminho | Resultado |
|---|---|
| Cadastrar | `estado--aviso` verde (`#e8f5e9`/`#1b5e20`), `role="status"`, nome canônico do servidor |
| Editar | idem, "Imóvel de … atualizado." |
| Excluir com sucesso | verde, `role="status"` |
| Excluir imóvel apagado por fora (404 real) | `estado--erro` vermelho (`#fdecea`/`#922b21`), `role="alert"` — **antes aparecia em verde** |
| Filtrar depois da mensagem | mensagem sai |
| F5 depois de cadastrar | mensagem **não** volta |

`ListaProprietarios` continua com um `aviso: string` simples: lá o slot só recebe
sucesso (a falha de renomear vai para `erroDeRenomear`, dentro do formulário
inline), então não existe a ambiguidade que motivou o tipo.

---

## 16. Mapa com Leaflet (tarefa 7)

Uma quarta tela, em `/imoveis/mapa`: os imóveis desenhados como pontos sobre
tiles do OpenStreetMap.

### Por que Leaflet, e onde o CSS dele entra

Leaflet porque o requisito é modesto — mostrar pontos — e ele resolve isso sem
chave de API, sem conta em serviço nenhum e sem servidor de tiles próprio. São
147 kB de JavaScript, e eles ficam no chunk da rota.

O CSS foi para `angular.json`, e essa foi a decisão que exigiu pensar. O
`leaflet.css` não alcança nada se for para o `styleUrl` do componente: o
encapsulamento emulado carimba `_ngcontent-*` nos elementos do template e
reescreve os seletores do componente para exigirem esse atributo. O Leaflet cria
contêiner, panes, tiles e popups por JavaScript, em runtime — esse DOM nunca
passa pelo compilador do Angular e não tem o atributo. As regras existiriam no
bundle sem casar com nada, e o mapa apareceria como uma pilha de imagens soltas.

Havia três saídas de verdade, e nenhuma é "impossível":

| Caminho | Custo |
|---|---|
| **`angular.json`** (escolhido) | 14,2 kB brutos / 3,1 kB transferidos, carregados em toda página |
| `ViewEncapsulation.None` | o CSS iria no chunk lazy, mas as regras próprias do componente vazariam sem escopo para o app inteiro |
| `:host ::ng-deep` | funciona — o DOM do Leaflet vive dentro do host, e o descendente não precisa do atributo —, mas `::ng-deep` está depreciado desde o Angular 4, e o Dart Sass não embute `@import` de arquivo `.css`, o que obrigaria a vendorizar uma cópia do `leaflet.css` |

Fiquei com o global porque é folha de estilo de terceiro, estável e versionada
pelo `package.json`. Envolvê-la em `::ng-deep` transformaria um arquivo que nunca
vou editar em código do projeto, para economizar 3,1 kB. O que de fato pesa — os
147 kB do JS — continua lazy pelo `loadComponent`.

Pela mesma restrição, o estilo do popup mora em `styles.scss` e não no SCSS do
componente: o conteúdo do popup é criado com `document.createElement`, então
também não recebe o `_ngcontent`.

Um problema clássico que não aconteceu: o `leaflet.css` referencia três PNGs por
caminho relativo, e com bundler isso costuma quebrar. O `@angular/build`
resolveu e reescreveu os três para `media/*-<hash>.png`, sem aviso.

### `MapaStore` — o que não herda de `StorePaginado`

Toda listagem do projeto herda dele. Esta não, e é a decisão do arquivo.

`StorePaginado` é construído em torno de `Pagina<T>`: expõe `pagina`,
`totalDePaginas`, `irParaPagina`, `primeira`, `última`, e tipa o GET como
`Pagina<T>`. Mapa não tem página 2. Herdar traria seis derivados presos em zero e
um `irParaPagina` público que ninguém pode chamar — API morta na subclasse, que é
o preço de usar herança como atalho de reuso.

O que de fato se repete são as ~15 linhas do `buscar`. Repetir 15 linhas sai mais
barato do que herdar a abstração errada. O contra-argumento honesto: agora
existem dois pipelines `carregando`/`erro` no projeto. Se aparecer uma segunda
tela sem paginação, aí sim há base a extrair — a mesma regra do pacote `comum`.

Sem `providedIn: 'root'`, como o `ImoveisDoProprietarioStore`: o componente
fornece, então sair da tela descarta os pontos. Um singleton manteria até 500
imóveis vivos em memória pelo resto da sessão. O custo é que reabrir o mapa refaz
a requisição — aceito, porque o requisito de "nenhuma requisição nova" da tarefa
3 é sobre voltar da edição para a listagem, e o mapa não participa desse fluxo.

O filtro compartilha o **tipo** `FiltroImoveis` com a listagem, mas não o
**valor**. Ler o filtro do `ImovelService` acoplaria as telas; escrever nele
dispararia uma busca da listagem a cada tecla digitada aqui. Compartilhar pela
metade seria pior que não compartilhar.

### O componente — a fronteira com um mundo imperativo

`afterNextRender` para montar (o `<div>` só existe depois da primeira
renderização), um `effect` para redesenhar quando os pontos mudam, e
`destroyRef.onDestroy` para o `map.remove()` — sem ele, sair da tela deixa para
trás os listeners de resize e teclado que o Leaflet registrou no `window`.

O `<div>` do mapa fica fora de qualquer `@if`. O Leaflet guarda referência ao
elemento na montagem; um bloco condicional que o destruísse e recriasse deixaria
o mapa apontando para um nó fora da página.

No `effect`, o signal é lido antes da guarda:

```ts
effect(() => {
  const pontos = this.store.pontos();
  if (this.mapa === null) { return; }
  this.desenharPontos(pontos);
});
```

É a leitura que registra a dependência. Com a guarda primeiro, o `effect` não
seria reexecutado quando os pontos chegassem.

Não há `ngZone.runOutsideAngular`, e a ausência é deliberada. É o conselho de
todo guia de Angular + Leaflet, porque arrastar e dar zoom disparariam uma
detecção de mudanças por quadro. Este app não tem `zone.js` — é zoneless, movido
por signals. Não existe zona da qual sair: o Leaflet já roda fora dela.

### `circleMarker` sobre `marker`, e canvas sobre DOM

`L.marker()` usa o ícone padrão, que resolve o caminho do PNG em runtime
inspecionando a folha de estilo carregada — a origem do marcador quebrado que
todo projeto Leaflet com bundler encontra uma vez. `circleMarker` é vetor: não
depende de asset nenhum.

Com `L.canvas()` como renderizador, os pontos são desenhados em um único
`<canvas>` em vez de um nó por imóvel. Com o teto de 500 do servidor, é a
diferença entre 1 nó e 500 no DOM. Confirmado no navegador: 12 pontos, 1
`canvas`.

A cor vem da paleta, lida de `:root` com `getComputedStyle`. O Leaflet desenha em
canvas e só aceita cor como valor, não `var(--cor-marca)`; sem essa ponte os
marcadores seriam as únicas cores do sistema fora do lugar onde a paleta mora —
o que a seção 14 foi desfazer. A legenda usa as mesmas custom properties no SCSS,
para não haver como legenda e pontos discordarem.

### O popup

Montado em DOM, e não em string de HTML. Duas razões:

- **Segurança.** Passar HTML ao `bindPopup` injetaria o nome do proprietário como
  marcação — um nome cadastrado com uma tag de imagem e um `onerror` viraria
  script executando na tela de quem abrisse o mapa. `textContent` não interpreta
  marcação.
- **Navegação.** Uma âncora com `href` recarregaria a aplicação inteira. O clique
  chama o `Router`, que troca de rota mantendo o estado em memória.

### O primeiro bug: um enquadramento que não acontece

Na primeira versão, o mapa carregava os 12 pontos e ficava parado no centro do
Brasil, com os imóveis fora da vista. Sem erro nenhum no console.

A instrumentação mostrou que o `enquadrar` era chamado, com os 12 pontos e o mapa
já medido em 1098×446 — a chamada acontecia e não surtia efeito. A causa é o
`fitBounds`: no padrão ele faz um pan animado quando o deslocamento é pequeno, e
a animação roda em `requestAnimationFrame`. Na carga inicial ela é agendada nos
primeiros milissegundos de vida do mapa e, se o navegador ainda não estiver
compondo quadros, o rAF não dispara e o pan nunca completa.

A correção é `animate: false`, e ela é melhor por si só: no primeiro desenho o
usuário não viu o mapa anterior, então não há transição a comunicar; e ao filtrar
o salto costuma ser grande o bastante para o Leaflet já ignorar a animação.
Instantâneo não depende de quadro nenhum.

O `maxZoom: 15` no enquadramento tem razão parecida: sem teto, um único imóvel no
resultado leva o `fitBounds` ao zoom máximo, e a tela abre em cima de um telhado,
sem referência em volta.

### O segundo bug: um `<canvas>` órfão por filtro

Encontrado ao medir o custo de desenhar muitos pontos — não pela leitura do
código.

O renderizador nascia dentro do `desenharPontos`:

```ts
const renderizador = L.canvas({ padding: 0.5 });   // errado: um por redesenho
```

`camada.clearLayers()` remove os marcadores do grupo, mas **não** remove o
renderizador do mapa: no Leaflet ele é um layer próprio, registrado quando o
primeiro caminho que o usa entra. Cada filtro aplicado deixava para trás um
`<canvas>` do tamanho da viewport e um layer registrado no mapa.

Medido antes da correção: cinco redesenhos, cinco `canvas` órfãos e cinco layers
a mais. Um usuário digitando num filtro com debounce chega a isso em segundos.

A correção é criar o renderizador uma vez, no `montarMapa`, e reusá-lo. Depois
dela, quatro redesenhos seguidos mantêm `canvas: 1` e a contagem de layers
estável.

Vale a nota de método: este bug não aparece em uso normal com 12 imóveis, não
gera erro no console e não tem sintoma visível até a memória apertar. Só apareceu
porque a pergunta "isso não vai ficar pesado?" virou medição.

### Quanto pesa, medido

Desenho de pontos sintéticos no mesmo caminho de código do componente, já com o
renderizador corrigido:

| Pontos | JSON | Tempo de desenho | Nós no DOM |
|---|---|---|---|
| 500 (o teto) | ~67 kB | **5 ms** | 1 `canvas` |
| 2.000 | ~270 kB | 12 ms | 1 `canvas` |
| 10.000 | ~1,3 MB | 58 ms | 1 `canvas` |
| 50.000 | ~6,9 MB | 243 ms | 1 `canvas` |

A conclusão é útil e contraria a intuição: **o gargalo não é o desenho, é o
transporte.** O canvas engole 50 mil pontos em 243 ms, mas os 6,9 MB de JSON que
os trazem é que tornam a tela inviável. A resposta real da API mede 1.764 bytes
para 12 imóveis — 147 bytes por ponto —, o que põe o teto de 500 em ~72 kB.

Isso confirma que o teto está no lugar certo (no servidor, cortando o que é
transportado) e não no cliente. E indica onde estaria o próximo ganho, caso o
teto precise subir: a resposta hoje trafega sem compressão — `server.compression`
está desligado, que é o padrão do Spring Boot —, e JSON repetitivo comprime bem.

### Verificação no navegador

| Situação | Resultado |
|---|---|
| Abrir `/imoveis/mapa` | contêiner Leaflet montado (1100×448), 15 tiles do OSM, crédito do OpenStreetMap presente |
| Marcadores | 12 pontos, 1 `canvas`, raio 6, cor `#34495e` lida de `--cor-marca` |
| Enquadramento inicial | centro `-17.3087, -43.0664` — o centro dos 12 pontos, e não a constante |
| Filtro `municipio=sao` | 2 pontos, zoom 12, centrado em São Paulo — 1 requisição, com debounce |
| Filtro sem resultado | 0 pontos, "Nenhum imóvel encontrado para esse filtro", vista volta ao Brasil |
| Ativo x inativo | `#34495e` e `#999`, as duas lidas da paleta |
| Popup | proprietário, município/UF, coordenada e botão — só as tags criadas por nós |
| Clicar em "Editar" | vai para `/imoveis/1/editar`, contador de navegações do browser inalterado (sem recarga) e o mapa desmontado |
| Teto estourado (teto a 4, temporário) | "Mostrando 4 dos 12 imóveis que atendem ao filtro. Refine a busca para ver os demais." |
| Bundle | chunk `mapa-imoveis` de 157,55 kB brutos / 40,59 kB transferidos — o Leaflet ficou no chunk da rota; o inicial subiu de 78,40 para 78,67 kB, só o CSS |

O `allowedCommonJsDependencies: ["leaflet"]` no `angular.json` silencia o aviso de
dependência não-ESM do build. É a forma que o CLI oferece para registrar que a
escolha é consciente, em vez de conviver com um aviso permanente.

---

## 17. Painel de filtros do mapa — estado e cidade

Os filtros do mapa saíram da faixa acima e viraram um painel à direita, com
**Estado** e **Cidade** como selects encadeados, alimentados pelo backend, mais o
**Proprietário** em texto.

### Por que selects, e não texto livre

O município era `<input type="search">` com busca parcial. Funciona, mas exige
que quem procura já saiba o que existe: digitar "Sant" e não achar nada não
distingue "não há imóvel em Santos" de "escrevi errado". Um select só oferece o
que existe, e a contagem ao lado de cada opção diz de antemão quanto o filtro vai
devolver.

O filtro de município em texto livre foi removido — o select faz o mesmo, melhor.
O de proprietário continua texto, porque nome de pessoa é conjunto aberto: uma
lista com todos os proprietários do cadastro seria a lista de proprietários, não
um filtro.

### `LocalidadeService` — cache, ao contrário do `MapaStore`

`providedIn: 'root'` com cache, enquanto o `MapaStore` é fornecido pelo
componente e morre com a tela. A diferença é o que cada um guarda: o mapa guarda
um recorte que depende do filtro do momento e envelhece a cada cadastro; isto
aqui é vocabulário — a lista de estados só muda quando alguém cadastra o primeiro
imóvel de um estado que ainda não tinha nenhum. Buscar de novo a cada visita
seria requisição previsivelmente idêntica.

O cache de municípios é **por UF**, num `Map`, e não uma lista só. Carregar as
cidades de todos os estados de uma vez traria, na base real, milhares de nomes
dos quais o usuário vai olhar os de um. É o mesmo raciocínio do teto do mapa: o
gargalo é o transporte.

Falha de rede **não** entra no cache. Sem esse cuidado, um erro de um instante
viraria "este estado não tem cidades" pelo resto da sessão.

### `FiltroDoMapa` — o momento de parar de compartilhar

O mapa usava o `FiltroImoveis` da listagem. Os dois eram idênticos até o mapa
ganhar `uf`, e este é exatamente o ponto em que a regra do projeto manda separar:
acrescentar `uf` ao tipo compartilhado obrigaria o formulário da listagem — que
tem dois campos — a declarar um terceiro que não usa, só para o `setValue`
continuar compilando no `strict`.

O que continua compartilhado é o que de fato é o mesmo: o backend serve os dois
endpoints com um único `ImovelSpecs`, então "filtrar por proprietário" significa
a mesma coisa nas duas telas. A duplicação aqui é de forma, não de regra.

### Os selects encadeados

Trocar de estado limpa a cidade escolhida — "Santos" não existe no Paraná. Sem
esse reset, o filtro mandaria um par UF/cidade impossível e o mapa ficaria vazio
sem explicação visível.

O reset usa `emitEvent: false` para não contar como mais uma mudança: a própria
troca de UF já dispara a busca, pela assinatura do formulário.

Sem estado escolhido, o select de cidade nasce **desabilitado** — a lista sempre
vem de uma UF, e um select vazio e clicável só faz o usuário descobrir isso
errando.

### Um erro que o console apontou

A primeira versão desabilitava o select pelo template:

```html
<select formControlName="municipio" [disabled]="filtroForm.controls.uf.value.length === 0">
```

O Angular avisa contra isso em tempo de execução: em formulário reativo o
atributo do template briga com o estado do `FormControl` e abre caminho para
erros de "changed after checked". A forma correta é `enable()`/`disable()` no
próprio controle, que é o que está lá agora. `getRawValue()` continua enxergando
o campo desabilitado, então o filtro não perde o valor.

Confirmado depois da correção: remontar o componente do mapa não emite aviso
nenhum.

### O painel

`grid-template-columns: 1fr 260px` — o mapa fica com a fração e o painel com
largura fixa. Não são duas frações porque o painel tem conteúdo de tamanho
previsível e não ganha nada em ficar mais largo, enquanto cada pixel a mais no
mapa mostra mais área.

Abaixo de 900px as duas colunas espremem o mapa, e o painel sobe para cima
(`order: -1`), onde continua sendo a primeira coisa que se lê. A contagem de
imóveis e a legenda mudaram-se para o painel: são informação sobre *o que está
sendo mostrado*, que é o assunto dele.

### Verificação no navegador

| Situação | Resultado |
|---|---|
| Abrir o mapa | painel em `x=930`, mapa em `x=90` com 824px — painel à direita |
| Select de estado | 10 UFs com nome e contagem: "RJ — Rio de Janeiro (2)" |
| Cidade sem estado | desabilitada, com "Escolha um estado" |
| Escolher `RJ` | cidade habilita e lista "Rio de Janeiro (2)"; mapa vai a 2 pontos |
| Escolher a cidade | filtro `uf=RJ` + `municipio=Rio de Janeiro`, 2 pontos |
| Trocar `RJ` → `SP` | cidade volta a vazio, lista troca para "São Paulo (2)", mapa em 2 pontos |
| "Limpar filtros" | filtro vazio, 12 pontos, cidade desabilitada de novo |
| Requisições | uma por mudança, com debounce; `/localidades/ufs` só na primeira visita |
| 375px de largura | painel acima do mapa, sem rolagem horizontal |
| Console | nenhum aviso ao remontar o componente |

---

## 18. Acabamento visual — a direção que faltava

Até aqui a interface funcionava e não dizia nada. Arial em 14px, `#34495e` de
framework de 2013, `--raio: 3px` em tudo, tabela com borda em toda célula. Cada
decisão isolada era defensável; juntas, eram a ausência de decisão — a aparência
que qualquer aplicação teria se ninguém tivesse escolhido nada.

Esta seção é só estilo. **Nenhum elemento novo entrou no HTML**; as duas
alterações de marcação foram `class="numero"` em cabeçalhos de coluna e um
`<div>` de largura no topo, ambas para o CSS ter onde se apoiar.

### A direção: instrumento de cadastro

Cadastro de imóvel é registro público, e a referência é essa: papel, tinta,
marcação de campo. Não SaaS.

| Antes | Agora | Por quê |
|---|---|---|
| `#f4f4f4` cinza neutro | `#f3f1ec` papel morno | cinza de sistema é a cor de quem não escolheu cor |
| `#34495e` azul-ardósia | `#123f38` verde-petróleo | o azul-ardósia é o default de framework mais reconhecível que existe |
| — | `#b4552f` terracota | um acento só, e com função: o ponto no mapa e a aba em que se está |
| Arial | IBM Plex Sans / Mono / Serif | ver abaixo |
| `--raio: 3px` | pílula / 10px / 14px | três raios com papéis, e mais arredondado, como pedido |

O acento existe porque uma paleta de um tom só não tem para onde apontar. Ele
aparece em dois lugares e em mais nenhum.

### Tipografia — três cortes, três papéis

- **IBM Plex Sans** na interface. Não é Inter nem Roboto, e tem o desenho
  levemente técnico que combina com o assunto.
- **IBM Plex Mono** em coordenada, área, contagem e posição de página. Não é
  enfeite: algarismo de largura fixa é o que faz a vírgula de uma linha cair
  debaixo da vírgula da outra. Com `tabular-nums`, a coluna de latitude vira uma
  coluna de verdade.
- **IBM Plex Serif**, só no wordmark do topo. É o único ponto da interface onde
  a família muda, e é deliberado: registro se assina em serifa. Se houvesse um
  segundo lugar, deixaria de ser um selo e viraria decoração.

Hierarquia por peso e espaçamento entre letras, não só por corpo. Rótulo de
campo em versalete espaçado de 11px: distingue-se do valor por forma, o que
libera o contraste de peso para a informação.

### A tabela

A mudança de maior efeito e a menos visível. Antes cada célula tinha borda em
volta — grade fechada, que transforma dado em formulário de papel e faz o olho
ler célula por célula em vez de varrer a linha. Agora só há régua horizontal, o
cabeçalho é versalete fraco sobre papel suave, e a linha inteira responde ao
hover. A moldura arredondada vive no contêiner de rolagem, não na tabela: é ele
que recorta os cantos, o que deixa a régua ir de ponta a ponta sem estourar o
raio.

### Elevação em dois passos, não sombra em tudo

`--sombra-1` é o repouso de uma superfície sobre o papel (tabela, painel,
formulário, filtros). `--sombra-2` só existe onde algo de fato flutua: o
`<dialog>` de confirmação e o popup do mapa. Sombra igual em tudo é o mesmo erro
da grade da tabela — quando tudo tem a mesma profundidade, profundidade deixa de
significar.

### O foco

Campo de texto usa halo (`box-shadow` de 3px na cor da marca a 14%) em vez de
`outline`, porque o halo acompanha o raio do campo e o `outline` desenha um
retângulo por fora dele. Onde o halo não cabe — botão, link, linha —, o anel
clássico, mas sempre na cor da marca. O azul do navegador não aparece em lugar
nenhum.

### Quatro coisas que a verificação encontrou

**1. Dois pares de cor reprovavam no AA.** A primeira paleta pôs
`--cor-texto-fraco` em `#6e7975`, que dá 4,18:1 sobre papel suave — abaixo do
mínimo, e justamente nos rótulos de 11px, onde o texto já é pequeno. Pior:
`--cor-texto-apagado` a 2,52:1 pintava a **linha inteira** do imóvel inativo.
Corrigido para `#626d69` (4,97:1) e a linha inativa passou a usá-lo. O token
apagado continua existindo, mas agora está documentado como **não textual** —
bolinha de legenda, marcador inativo, controle desabilitado, casos em que a WCAG
não exige contraste.

**2. O link estava azul.** A tabela de proprietários usa o nome como link, e ele
saía no azul default do navegador com sublinhado default — a única cor da
interface que ninguém tinha escolhido. Agora é tinta da marca com sublinhado em
tom de borda, que assume a cor do texto no hover. A regra exclui `.botao` e
`.menu__item`, que são âncoras com aparência própria.

**3. O controle de zoom do Leaflet era de outro aplicativo.** Canto de 4px e
sombra preta a 65%, numa tela inteira de cantos macios e sombras de 4%.
Realinhado ao raio, à borda e à elevação daqui — junto com o popup, o balão e a
atribuição.

**4. Cabeçalho de coluna numérica desalinhado.** "IMÓVEIS" à esquerda com os
números à direita, embaixo. Os `th` dessas colunas ganharam `class="numero"`, com
uma regra que herda o alinhamento e devolve a família da interface: a fonte de
largura fixa serve ao dígito, e o rótulo em versalete não é dígito.

### Movimento

Só transição de cor em hover e foco, 0,15s. Nada é comunicado exclusivamente
pela transição, e tudo fica atrás de `prefers-reduced-motion`.

### Verificação

| Item | Resultado |
|---|---|
| Fontes | as três famílias carregadas e aplicadas (`document.fonts.check`) |
| Contraste | 8 pares medidos, todos ≥ 4,5:1 — o menor é 4,76:1 |
| Alinhamento | wordmark e título da página ambos em `x=88`, na mesma medida de 1100px |
| Tabela | régua só horizontal, raio de 14px no contêiner, hover por linha |
| Mapa | marcador terracota, controle de zoom com raio de 10px e elevação nível 1 |
| Diálogo | raio de 14px, elevação nível 2, backdrop dessaturado |
| 375px | cabeçalho e menu quebram, tabela rola dentro do próprio contêiner, **sem rolagem horizontal na página** |
| Toque | `.botao--pequeno` cresce para 40px sob `pointer: coarse` |
| Build | sem aviso; `styles` foi de 3,17 kB para 3,9 kB transferidos |

### O que não foi mexido, e por quê

O botão de confirmar do `<app-confirmacao>` continua verde-marca, inclusive
quando a pergunta é "Excluir o imóvel de…". Visualmente ele deveria ser
destrutivo — mas o mesmo diálogo confirma cadastro e edição, e uma regra de CSS
pintaria "Cadastrar" de vermelho junto. Resolver direito pede um input de
variante no componente, o que é mudança de API e não de estilo. Fica registrado
como o próximo passo visual.

---

## 19. Área do lote no formulário e no mapa (tarefa 8)

Duas mudanças de tela: o cadastro ganha largura e comprimento, e o mapa passa a
desenhar a área real de quem tem dimensões.

### A área deixa de ser digitável quando é derivada

Com o par de dimensões preenchido, o campo **Área** mostra o produto e fica
desabilitado, com a nota "Calculada: largura × comprimento". Apagar uma das
dimensões devolve o campo.

É o que o backend faz de qualquer forma — com dimensões, a área digitada é
descartada. Deixar o campo editável seria oferecer um valor que vai ser jogado
fora no servidor, e o usuário só descobriria ao reabrir o imóvel.

A sincronia usa `enable()`/`disable()` no `FormControl`, e não o atributo
`disabled` no template: em formulário reativo o atributo briga com o estado do
controle, e o Angular avisa contra em runtime. Foi a lição da seção 17, aplicada
sem repetir o erro. `getRawValue()` continua enxergando o campo desabilitado,
então o payload não perde a área.

`emitEvent: false` na escrita da área, senão ela realimenta a própria assinatura
de `valueChanges` e o formulário entra em laço.

### Duas representações do mesmo imóvel

O mapa desenha **polígono** quando há geometria e **ponto** quando não há. Não são
dois tipos de coisa — é o mesmo imóvel, e o que muda é o que se sabe sobre ele.
Os 12 da carga inicial continuam pontos até alguém informar as dimensões.

O enquadramento passou a usar os **vértices** do lote, e não o centro. Com o
centro, um lote grande na borda do resultado teria parte da divisa fora da vista.

Preenchimento em 25% de opacidade, de propósito: o polígono precisa deixar ver o
que há embaixo — quadra, rua, o vizinho. Preenchimento sólido esconderia
exatamente a informação que faz alguém abrir um mapa.

### A inversão de eixos, que não é detalhe

O backend manda GeoJSON, e **GeoJSON é `[longitude, latitude]`**. O Leaflet é
`[latitude, longitude]`. Trocar os dois compila, roda sem erro nenhum e põe os
imóveis do Paraná na Somália. A conversão está isolada em `contornoDoLote`, com
um `try` em volta do `JSON.parse` — é texto vindo da rede, e um payload truncado
não pode derrubar o desenho dos outros imóveis da tela.

O polígono chega como **string**, e não como objeto, porque é assim que o
`ST_AsGeoJSON` do Postgres devolve. Desserializar no backend só para serializar de
novo seria trabalho puro.

### O erro que depende de outra pessoa

Cadastrar passa a poder falhar por um motivo novo: `409`, "A área informada
conflita com a de outro imóvel já cadastrado." Não é erro no que o usuário
digitou — é o estado do cadastro.

Nada precisou ser escrito para isso aparecer: o `mensagemDeErro` já lê o `detail`
do ProblemDetail, então a mensagem do backend chega à tela por si. Verificado: o
usuário fica no formulário, com os dados preenchidos, e a mensagem sai em
`role="alert"`.

### Verificação no navegador

| Situação | Resultado |
|---|---|
| Só largura preenchida | área continua digitável, sem cálculo |
| Largura 20 + comprimento 30 | área vira `600` e desabilita, com a nota visível |
| Apagar o comprimento | área volta a ser editável |
| Mapa filtrado por PR | 2 polígonos e 1 ponto — os dois lotes com dimensões e o imóvel do seed |
| Polígono desenhado | 4 vértices, cor da paleta (`#b4552f`), opacidade 0,25 |
| Cadastro invadindo outro lote | mensagem do `409` na tela, `role="alert"`, sem sair do formulário |
| Build | chunk do mapa em 41,96 kB transferidos — o desenho de polígono não trouxe dependência nova |

---

## 20. Desenhar o lote no mapa

Com o backend aceitando polígono livre (seção 21 do documento do backend), a
entrada deixou de ser dois números e passou a ser um contorno. O componente
`DesenhoDoLote` vive dentro do formulário: clique marca vértice, linha tracejada
liga os pontos, clicar no primeiro fecha o lote.

**A visualização saiu de graça.** O `contornoDoLote` do mapa já convertia GeoJSON
em `L.polygon`, e não se importa se o anel tem 5 vértices ou 40 — o trabalho
todo estava na entrada.

| Decisão | Por quê |
|---|---|
| Emite `null` enquanto o contorno não fecha | É o que impede salvar meia figura. Até fechar, `largura`/`comprimento` continuam valendo |
| Clique em lote fechado não acrescenta vértice | Quem terminou o desenho clica no mapa para arrastar; um vértice novo aparecendo do nada quebraria a forma |
| "Ir para a coordenada" é botão, não automático | A latitude é digitada dígito a dígito, e "-2" é uma coordenada válida no meio do Atlântico — o mapa saltaria para lá antes de o número terminar |
| Altura explícita no contêiner | Mesma armadilha do mapa principal: com altura automática o Leaflet mede 0px e a tela fica em branco, sem erro no console |

O `corDaPaleta` foi extraído para `core/`: o mapa e o desenho leem as mesmas
cores de `:root`, e a cópia que existia no componente do mapa saiu. O mesmo para
a leitura de GeoJSON, que virou `verticesDoGeoJson` em `lote.model.ts`.

### Dois defeitos encontrados testando

**Editar apagava o lote.** Abrir a edição de um imóvel com lote desenhado e
salvar sem tocar no mapa enviava `poligono: null`, que o backend entende como
"apague a geometria". O formulário só era informado do polígono por ação do
usuário — nunca pela carga. Corrigido com um `desenhoTocado`, que distingue
"ainda não mexi" de "apaguei de propósito".

**"Limpar" não limpava.** O efeito que carrega o lote salvo observava os
vértices, via a lista vazia e repunha o desenho. O lote reaparecia na tela
enquanto o formulário já o considerava removido.

### A área mostrada é uma prévia, e o documento diz o quanto

O cálculo no navegador usa a fórmula do excesso esférico; o que se grava vem do
`ST_Area` sobre a geometria projetada em UTM. Os dois **não batem**, e a
diferença não é desprezível — um lote medido em Curitiba deu 3.852,56 m² na tela
e 3.835,94 m² no PostGIS, **0,43%**.

Zerar essa distância exigiria uma biblioteca de reprojeção no navegador para
acertar um número que o servidor recalcula de qualquer forma. Por isso a tela
chama aquilo de "área do desenho", e o campo de área do formulário só é
preenchido depois de salvar.

### Lista de pontos

Abaixo do mapa, os vértices em `<ol>` numerada — e não em tabela, porque **a
ordem é a informação**: trocar o terceiro ponto pelo quarto desenha outro
terreno. O número da lista é o mesmo da sequência dos cliques.

Sete casas decimais, a precisão da coluna `NUMERIC(10,7)` do banco, e com
**ponto decimal** em vez da vírgula que o `DecimalPipe` produziria em pt-BR:
coordenada é notação técnica, é assim que o popup do mapa já mostrava, e é assim
que precisa sair da tela para ser colada em outra ferramenta. A lista tem teto
de altura com rolagem própria — um lote rural pode ter dezenas de pontos, e eles
não podem empurrar os botões de salvar para fora da tela.

### Unidade de área

Seletor de m², hectare e alqueire. O alqueire é o **paulista**, de 24.200 m²; o
mineiro tem o dobro, e o rótulo diz qual é em vez de deixar o usuário supor.
Hectare e alqueire são exibidos com quatro casas, porque 300 m² são 0,03 ha.

---

## 21. CEP que preenche o endereço

Campo de CEP antes do endereço, consultando a **BrasilAPI** (`/api/cep/v2/{cep}`)
direto do navegador. A v2 é a que devolve a coordenada da via; com a v1 o mapa
de desenho continuaria abrindo no país inteiro depois de o usuário já ter dito
onde fica o imóvel.

Chamada do cliente, e não por um endpoint próprio: é conveniência de formulário,
não regra de negócio — nada do que vem de lá é gravado sem passar pela validação
de sempre, e a BrasilAPI responde com `access-control-allow-origin: *`.

| Decisão | Por quê |
|---|---|
| Busca ao completar 8 dígitos, sem botão | CEP tem tamanho fixo; quem terminou de digitar já disse tudo o que tinha a dizer |
| Coordenada só preenche se estiver vazia | O CEP localiza a via; o ponto do imóvel é mais específico que isso, e sobrescrevê-lo trocaria um dado melhor por um pior |
| 404 vira frase própria | "CEP não encontrado" é resposta, não falha de sistema — distinta da mensagem de rede indisponível |
| Cache por CEP | Endereço não muda durante a sessão; voltar ao campo não vale uma segunda ida à rede |
| O JSON da API morre no serviço | O resto da aplicação fala `EnderecoDoCep`; uma mudança do lado de lá vaza em um arquivo só |

**O CEP não é persistido** — não vai no payload nem tem coluna. É um atalho de
preenchimento, e a tela diz isso.

---

## 22. CPF identifica o proprietário

Campo de CPF antes do nome. Ao completar 11 dígitos válidos, o formulário
consulta `GET /api/proprietarios/cpf/{cpf}` e, achando alguém, **troca o nome do
campo pelo do cadastro**:

> **Proprietário já cadastrado:** Ana Paula Ribeiro — 3 imóveis. O novo imóvel
> será ligado a ele.

A troca é dita em voz alta de propósito. É o nome que o servidor vai usar de
qualquer forma, e mostrar outro na tela até o momento de salvar seria mentir
sobre a que proprietário o imóvel vai ficar ligado — mas uma troca silenciosa
pareceria o formulário apagando o que a pessoa digitou.

A validação de dígitos verificadores é repetida no navegador (`cpf.ts`). Não é
redundância inútil: sem ela o usuário só descobre o erro depois de submeter o
formulário inteiro, e a consulta sairia para a rede sabendo de antemão que não
vai achar nada. Quem decide continua sendo o servidor — o arquivo adianta a
resposta, não a substitui.

Falha de rede na consulta **não trava o cadastro**: o servidor refaz a
identificação ao salvar, e é a decisão dele que vale.

A listagem de proprietários ganhou coluna de CPF, formatada, com travessão para
quem não tem — célula vazia pareceria falha da coluna, e não ausência de
documento.

---

## O que ficou de fora, e por quê

| Item | Motivo |
|---|---|
| **Testes automatizados** | Nenhum `.spec.ts` existe, apesar de `vitest` estar configurado. Mesma lacuna do backend, e a mais séria do que restou. |
