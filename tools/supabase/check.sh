#!/bin/sh
# Проверка tools/supabase/schema.sql на своём Postgres: чистая база,
# заглушка того, что есть в Supabase, схема дважды (повторный запуск
# безопасен), проверки. Нужен psql и сервер, к которому он подключается
# (переменные PGHOST, PGPORT, PGUSER — как у psql).
set -e
dir=$(dirname "$0")
db=erp_schema_check
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $db" -c "create database $db"
for f in local-stub.sql schema.sql schema.sql check.sql; do
  psql -q -X -v ON_ERROR_STOP=1 -d $db -f "$dir/$f"
done
psql -q -d postgres -c "drop database $db"
