-- O nome deixa de identificar o proprietario. Quem identifica e o CPF.
--
-- A V4 fez o nome unico porque era a unica coluna que existia: naquele momento
-- "mesmo nome" era a definicao de "mesma pessoa". A V9 mudou a identidade para
-- o CPF e deixou a restricao antiga no lugar, e a contradicao aparecia no
-- cadastro: dois homonimos com CPFs diferentes sao duas pessoas, mas o UNIQUE
-- afirmava que sao uma so.
--
-- Sem esta migration o ResolverProprietario nao tem onde criar o segundo, e lhe
-- restavam dois desfechos, ambos errados: recusar um cadastro legitimo, ou
-- carimbar o CPF novo no homonimo que ainda estava sem documento — fundindo em
-- silencio duas pessoas, e com elas os imoveis de ambas.
--
-- O B-tree de nome nao vem desta constraint: o idx_proprietario_nome foi criado
-- a parte na V4, entao a ordenacao da listagem continua sustentada. O indice de
-- trigrama da busca tambem e outro.
ALTER TABLE proprietario DROP CONSTRAINT uk_proprietario_nome;

COMMENT ON COLUMN proprietario.nome IS
    'Como a pessoa e chamada. Nao identifica: homonimos com CPFs diferentes sao registros distintos.';

-- A coluna segue aceitando nulo pelos proprietarios anteriores a V9, que
-- ninguem pode documentar retroativamente. A diferenca e que completar um
-- desses cadastros passou a ser ato explicito (PATCH /api/proprietarios/{id}/cpf)
-- em vez de inferencia a partir de nome igual.
COMMENT ON COLUMN proprietario.cpf IS
    'CPF apenas com digitos, e a identidade do proprietario. Nulo so para os anteriores a V9.';
