#!/bin/sh
# Runs once, on first initialization of the Postgres data volume.
# Creates the dedicated database that `pytest` uses, so running the test
# suite never touches your development data.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE DATABASE paperswipe_test OWNER $POSTGRES_USER;
SQL
