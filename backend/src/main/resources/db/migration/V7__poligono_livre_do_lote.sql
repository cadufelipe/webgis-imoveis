-- O lote deixa de ser sempre um retangulo alinhado aos eixos e passa a aceitar
-- poligono desenhado vertice a vertice.
--
-- A consequencia estrutural e' que `geom` nao pode mais ser GENERATED ALWAYS:
-- ela vira dado de entrada. Com isso some a garantia, de graca, de que a
-- geometria nunca diverge de latitude/longitude — e as duas CHECK do fim deste
-- arquivo existem para repor exatamente essa garantia.
--
-- `lote_retangular` **continua existindo**: quem informa largura e comprimento
-- em vez de desenhar continua tendo o retangulo montado, agora na escrita e nao
-- por coluna gerada.

-- A constraint e o indice dependem da coluna, entao caem antes dela.
ALTER TABLE imovel DROP CONSTRAINT uk_imovel_sem_sobreposicao;
DROP INDEX idx_imovel_geom;
ALTER TABLE imovel DROP COLUMN geom;

ALTER TABLE imovel ADD COLUMN geom geometry(POLYGON, 31982);

-- Nenhum lote e' perdido: quem tinha dimensoes recebe o mesmo retangulo que a
-- coluna gerada produzia. Os 12 do seed seguem sem geometria, como antes.
UPDATE imovel
SET geom = lote_retangular(latitude, longitude, largura, comprimento)
WHERE largura IS NOT NULL
  AND comprimento IS NOT NULL;

CREATE INDEX idx_imovel_geom ON imovel USING gist (geom);

-- Recriada identica a' V6, inclusive o encolhimento de 0,6 m: o motivo nao
-- mudou (o passo do float4 no northing daqui e' de 0,5 m), e a constraint nao
-- se importa com a origem da geometria.
ALTER TABLE imovel
    ADD CONSTRAINT uk_imovel_sem_sobreposicao
    EXCLUDE USING gist (ST_Buffer(geom, -0.6) WITH &&);

-- ---------------------------------------------------------------------------
-- As duas garantias que a coluna gerada dava sozinha.

-- Anel aberto, com menos de quatro posicoes ou auto-interseccao ("gravata
-- borboleta") sao poligonos que o Postgres aceita guardar e o ST_Area calcula
-- errado. A aplicacao ja recusa antes; esta CHECK fecha os outros caminhos.
ALTER TABLE imovel
    ADD CONSTRAINT ck_imovel_geom_valida
    CHECK (geom IS NULL OR ST_IsValid(geom));

-- O ponto do imovel tem que cair no proprio lote. Sem isto, editar so a
-- latitude deixaria o marcador do mapa em uma cidade e o poligono em outra.
--
-- Tolerancia de 0,5 m, e nao ST_Contains exato, por dois motivos: o ponto e'
-- gravado em NUMERIC(10,7), o que ja arredonda cerca de 1 cm, e para lote
-- concavo (terreno em L) a aplicacao usa ST_PointOnSurface, cujo resultado
-- reprojetado ida e volta nao volta exatamente sobre o mesmo pixel.
ALTER TABLE imovel
    ADD CONSTRAINT ck_imovel_ponto_dentro_do_lote
    CHECK (geom IS NULL OR ST_DWithin(
        geom,
        ST_Transform(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), 31982),
        0.5));
