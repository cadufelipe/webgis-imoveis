-- Aumenta o encolhimento da trava de sobreposicao de 0,6 m para 1,5 m.
--
-- O 0,6 da V6 foi medido com os lotes retangulares de entao, de algumas dezenas
-- de metros. Com poligono livre aparecem lotes rurais, e ai o numero nao serve
-- mais: dois vizinhos de 800 m de frente que dividem a divisa exata sao
-- recusados, embora ST_Touches confirme que a area comum e' zero.
--
-- Medido nesta base, com dois lotes de ~53 ha lado a lado:
--   gap real entre as geometrias encolhidas em 0,6 m .... 0,189 m
--   arredondamento do bbox em float4 no northing daqui .. ate 0,5 m para cada lado
-- O gap real e' menor que o erro do indice, entao o `&&` acusa colisao onde nao
-- ha. A borda sul de um lote largo nao e' reta em UTM, e a curvatura come a
-- folga que o encolhimento deveria garantir.
--
-- Com 1,5 m sobra cerca de 1 m depois do arredondamento, o que cobre a
-- curvatura de lotes bem maiores.
--
-- **O que se perde:** a constraint deixa de acusar sobreposicoes menores que
-- ~3 m. Isso e' aceitavel porque ela nunca foi a checagem principal — quem
-- recusa o cadastro com mensagem util e' o VerificarSobreposicao, que compara a
-- geometria exata em dupla precisao. O papel daqui e' fechar a corrida entre
-- duas requisicoes simultaneas, e uma corrida real acontece com dois cadastros
-- do mesmo lote, nao com dois lotes que se tocam por 2 m.
--
-- **Lote muito pequeno fica de fora:** com menos de 3 m em qualquer direcao, o
-- ST_Buffer negativo devolve geometria vazia e a linha nao participa da
-- constraint. Continua protegida pela checagem da aplicacao.

ALTER TABLE imovel DROP CONSTRAINT uk_imovel_sem_sobreposicao;

ALTER TABLE imovel
    ADD CONSTRAINT uk_imovel_sem_sobreposicao
    EXCLUDE USING gist (ST_Buffer(geom, -1.5) WITH &&);
