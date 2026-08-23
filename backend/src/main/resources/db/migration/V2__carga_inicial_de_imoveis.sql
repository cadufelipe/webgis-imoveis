-- Carga inicial de exemplo.
--
-- Sem guarda de idempotencia: o Flyway registra esta migration na tabela
-- flyway_schema_history e nunca a reexecuta. "Rodar uma vez" passou a ser
-- garantia da ferramenta, nao responsabilidade do script.

INSERT INTO imovel
    (proprietario, municipio, uf, bairro, rua, numero, latitude, longitude, area_m2, ativo, criado_em, atualizado_em)
VALUES
    ('Maria Aparecida Souza',   'São Paulo',      'SP', 'Pinheiros',        'Rua dos Pinheiros',        '1245',  -23.5629000, -46.6944000,  320.50, TRUE, NOW(), NOW()),
    ('João Carlos Ferreira',    'São Paulo',      'SP', 'Santana',          'Avenida Braz Leme',        '890',   -23.5010000, -46.6280000,  450.00, TRUE, NOW(), NOW()),
    ('Ana Beatriz Lima',        'Rio de Janeiro', 'RJ', 'Copacabana',       'Rua Barata Ribeiro',       '512',   -22.9686000, -43.1869000,  180.75, TRUE, NOW(), NOW()),
    ('Carlos Eduardo Nunes',    'Rio de Janeiro', 'RJ', 'Tijuca',           'Rua Conde de Bonfim',      '1100',  -22.9245000, -43.2340000,  210.00, TRUE, NOW(), NOW()),
    ('Fernanda Ribeiro Alves',  'Belo Horizonte', 'MG', 'Savassi',          'Rua Pernambuco',           '77',    -19.9370000, -43.9350000,  265.30, TRUE, NOW(), NOW()),
    ('Roberto Antunes Melo',    'Curitiba',       'PR', 'Batel',            'Avenida do Batel',         '1560',  -25.4420000, -49.2920000,  390.00, TRUE, NOW(), NOW()),
    ('Patrícia Gomes Duarte',   'Porto Alegre',   'RS', 'Moinhos de Vento', 'Rua Padre Chagas',         '340',   -30.0250000, -51.2050000,  155.60, TRUE, NOW(), NOW()),
    ('Luiz Henrique Barbosa',   'Salvador',       'BA', 'Barra',            'Avenida Oceânica',         '2200',  -13.0100000, -38.5330000,  275.90, TRUE, NOW(), NOW()),
    ('Juliana Martins Rocha',   'Recife',         'PE', 'Boa Viagem',       'Avenida Boa Viagem',       '4500',   -8.1200000, -34.9000000,  198.40, TRUE, NOW(), NOW()),
    ('Marcos Vinícius Teixeira','Fortaleza',      'CE', 'Aldeota',          'Avenida Santos Dumont',    '3131',   -3.7350000, -38.4950000,  340.00, TRUE, NOW(), NOW()),
    ('Camila Freitas Andrade',  'Goiânia',        'GO', 'Setor Bueno',      'Rua T-55',                 '820',   -16.7050000, -49.2720000,  410.25, TRUE, NOW(), NOW()),
    ('Eduardo Pacheco Silva',   'Florianópolis',  'SC', 'Campeche',         'Avenida Pequeno Príncipe', 'S/N',   -27.6780000, -48.4900000,  520.00, TRUE, NOW(), NOW());
