#!/bin/sh
# Runs once, only when the data volume is first initialised. POSTGRES_DB (bayana_dev) is
# created by the image itself; this adds the test database. Existing volumes are untouched;
# use `pnpm.cmd db:create` for those.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
SELECT 'CREATE DATABASE bayana_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bayana_test')\gexec
SQL
