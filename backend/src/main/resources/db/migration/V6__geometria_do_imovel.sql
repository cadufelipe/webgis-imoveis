-- Tarefa 8: o imovel passa a ter area real, e nao um ponto solto com um numero
-- de metros quadrados ao lado.
--
-- Exige a extensao PostGIS instalada no servidor (nao e' extensao "trusted",
-- entao o CREATE precisa de superusuario). Sem ela, esta migration falha na
-- subida e o backend nao sobe — de proposito: um schema pela metade seria pior.
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- O lote, derivado do centro e das dimensoes.
--
-- IMMUTABLE porque a coluna gerada abaixo exige isso, e a funcao de fato so
-- depende dos argumentos: ST_Transform, ST_MakeEnvelope, ST_SetSRID e
-- ST_MakePoint sao todas IMMUTABLE (conferido em pg_proc).
--
-- STRICT resolve o imovel sem geometria com elegancia: qualquer argumento nulo
-- devolve nulo, entao os 12 imoveis do seed — que nao tem largura nem
-- comprimento e cujas dimensoes nenhuma migration pode inventar — simplesmente
-- ficam com geom nula.
--
-- Convencoes deliberadas, porque o enunciado da liberdade e alguem precisa
-- decidir: o ponto informado e o **centro** do lote, e o retangulo e alinhado
-- aos eixos da projecao (largura no eixo leste-oeste, comprimento no
-- norte-sul). Lote rotacionado por azimute fica fora do escopo.
CREATE OR REPLACE FUNCTION lote_retangular(
        lat numeric, lon numeric, largura numeric, comprimento numeric)
    RETURNS geometry(POLYGON, 31982)
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT ST_MakeEnvelope(
               ST_X(p) - largura / 2, ST_Y(p) - comprimento / 2,
               ST_X(p) + largura / 2, ST_Y(p) + comprimento / 2,
               31982)
    FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 31982) AS p) s;
$$;

COMMENT ON FUNCTION lote_retangular IS
    'Retangulo do lote em SIRGAS 2000 / UTM 22S, a partir do centro e das dimensoes em metros.';

-- ---------------------------------------------------------------------------
-- Dimensoes: opcionais. Imovel sem elas continua valido e fica de fora da
-- validacao de sobreposicao.
ALTER TABLE imovel
    ADD COLUMN largura     NUMERIC(10, 2),
    ADD COLUMN comprimento NUMERIC(10, 2);

-- Ambas ou nenhuma. Meia dimensao nao gera retangulo, e deixar passar criaria
-- um estado que a aplicacao teria de tratar para sempre.
ALTER TABLE imovel
    ADD CONSTRAINT ck_imovel_dimensoes_completas
    CHECK ((largura IS NULL) = (comprimento IS NULL));

ALTER TABLE imovel
    ADD CONSTRAINT ck_imovel_dimensoes_positivas
    CHECK (largura IS NULL OR (largura > 0 AND comprimento > 0));

-- ---------------------------------------------------------------------------
-- A geometria e' coluna GERADA, e nao gravada pela aplicacao.
--
-- E' a unica forma de garantir que ela nunca divirja de latitude, longitude,
-- largura e comprimento. Se a aplicacao gravasse, bastaria um caminho de
-- atualizacao esquecer de recalcular para o poligono passar a descrever um
-- imovel que nao existe mais naquele lugar — e nada acusaria.
ALTER TABLE imovel
    ADD COLUMN geom geometry(POLYGON, 31982)
    GENERATED ALWAYS AS (lote_retangular(latitude, longitude, largura, comprimento)) STORED;

CREATE INDEX idx_imovel_geom ON imovel USING gist (geom);

-- ---------------------------------------------------------------------------
-- A trava contra sobreposicao.
--
-- Encolhimento de 0,6 m em cada lote antes de comparar, e isso NAO e' arbitrario.
-- O operador && compara bounding boxes, e o PostGIS guarda essas caixas em
-- float4. Na magnitude das coordenadas UTM daqui o passo do float4 e' de
-- 0,125 m no easting (~673.000) e de **0,5 m** no northing (~7.190.000).
-- Com encolhimento menor que isso, dois lotes que apenas dividem a divisa —
-- o caso mais comum de um cadastro — sao recusados. Foi medido: 0,001, 0,01 e
-- 0,05 recusam vizinhos; 0,5 ja passa. 0,6 da folga sobre o passo.
--
-- Consequencia assumida: esta constraint e' um guarda-costas grosso. Ela pega
-- sobreposicoes acima de ~1,2 m. A checagem exata, com ST_Overlaps sobre a
-- geometria real em dupla precisao, vive na aplicacao e e' quem produz a
-- mensagem para o usuario. O papel daqui e' fechar a corrida entre duas
-- requisicoes simultaneas, que nenhuma checagem em SELECT resolve.
--
-- Linhas com geom nula sao ignoradas pela constraint, como em qualquer indice.
ALTER TABLE imovel
    ADD CONSTRAINT uk_imovel_sem_sobreposicao
    EXCLUDE USING gist (ST_Buffer(geom, -0.6) WITH &&);
