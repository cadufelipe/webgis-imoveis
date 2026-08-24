-- Busca textual insensivel a acento e a maiusculas, com indice que a sustenta.
--
-- Problema: LIKE '%sao%' nao encontra 'Sao Paulo' escrito com til, e o usuario
-- nao digita acento em campo de busca.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() nao e IMMUTABLE (depende do dicionario configurado), entao nao pode
-- ser usada diretamente em indice. A forma de dois argumentos fixa o dicionario,
-- o que torna o wrapper deterministico e indexavel.
CREATE OR REPLACE FUNCTION sem_acento(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT public.unaccent('public.unaccent', lower(texto)) $$;

-- Indice GIN com trigramas: e o unico tipo que atende LIKE '%termo%'.
-- Um B-tree comum so serve para prefixo ('termo%'), inutil aqui.
CREATE INDEX idx_imovel_proprietario_busca
    ON imovel USING gin (sem_acento(proprietario) gin_trgm_ops);

CREATE INDEX idx_imovel_municipio_busca
    ON imovel USING gin (sem_acento(municipio) gin_trgm_ops);
