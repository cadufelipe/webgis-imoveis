-- O proprietario passa a ter CPF, e o CPF passa a ser quem o identifica.
--
-- **Opcional, e nao obrigatorio.** Os proprietarios que ja existem vieram da
-- carga inicial e da extracao da V4, onde so havia nome: exigir CPF agora
-- significaria inventar documento para eles. Quem tem CPF e' identificado por
-- ele; quem nao tem continua sendo identificado pelo nome, como antes.
--
-- UNIQUE aceita varios nulos no Postgres, entao a restricao vale so para quem
-- de fato informou o documento.
ALTER TABLE proprietario ADD COLUMN cpf VARCHAR(11);

ALTER TABLE proprietario
    ADD CONSTRAINT uk_proprietario_cpf UNIQUE (cpf);

-- Guardado so em digitos: a pontuacao e' formatacao de tela, e duas grafias do
-- mesmo documento ("111.444.777-35" e "11144477735") passariam pelo UNIQUE como
-- se fossem pessoas diferentes. A aplicacao normaliza antes de gravar; esta
-- CHECK fecha os outros caminhos.
ALTER TABLE proprietario
    ADD CONSTRAINT ck_proprietario_cpf_digitos
    CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

COMMENT ON COLUMN proprietario.cpf IS
    'CPF apenas com digitos. Nulo para os proprietarios anteriores a esta migration.';
