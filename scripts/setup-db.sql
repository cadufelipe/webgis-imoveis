-- Cria o banco do WebGIS no Postgres local.
-- Rode como superusuario:  sudo -u postgres psql -f scripts/setup-db.sql
--
-- A aplicacao conecta como o proprio usuario 'postgres' (ver
-- application.properties), entao nao ha role dedicada a criar. As tabelas sao
-- criadas pelo Flyway na primeira subida do backend, junto com a carga inicial
-- de 12 imoveis; o Hibernate roda em ddl-auto=validate e nao altera nada.
--
-- A extensao PostGIS precisa estar instalada no servidor: o CREATE EXTENSION da
-- migration exige superusuario, e sem ela o backend nao sobe.

SELECT 'CREATE DATABASE webgis ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'webgis')
\gexec
