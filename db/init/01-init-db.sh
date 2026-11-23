#!/bin/bash
set -e
# This script runs automatically via /docker-entrypoint-initdb.d/ on first
# container start (only when the data volume is empty). It creates the
# payroll database and user if they don't already exist.
#
# NOTE: POSTGRES_DB / POSTGRES_USER are hardcoded to "postgres" in
# docker-compose.yml (that's what bootstraps the base image's superuser).
# The app's real db/user names come through as APP_DB_NAME / APP_DB_USER.
DB_NAME="${APP_DB_NAME:-payroll_db}"
DB_USER="${APP_DB_USER:-payroll_user}"
DB_PASSWORD="${POSTGRES_PASSWORD}"

echo "Checking if role '$DB_USER' exists..."
psql -v ON_ERROR_STOP=1 --username "postgres" --dbname "postgres" <<-EOSQL
    DO
    \$do\$
    BEGIN
        IF NOT EXISTS (
            SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER'
        ) THEN
            CREATE ROLE "$DB_USER" WITH LOGIN PASSWORD '$DB_PASSWORD';
            RAISE NOTICE 'Role $DB_USER created';
        ELSE
            RAISE NOTICE 'Role $DB_USER already exists, skipping';
        END IF;
    END
    \$do\$;
EOSQL

echo "Checking if database '$DB_NAME' exists..."
DB_EXISTS=$(psql -v ON_ERROR_STOP=1 --username "postgres" --dbname "postgres" -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating database '$DB_NAME'..."
    psql -v ON_ERROR_STOP=1 --username "postgres" --dbname "postgres" \
        -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
else
    echo "Database '$DB_NAME' already exists, skipping"
fi

echo "Granting privileges..."
psql -v ON_ERROR_STOP=1 --username "postgres" --dbname "$DB_NAME" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
    GRANT ALL ON SCHEMA public TO "$DB_USER";
EOSQL

echo "Postgres init complete: db=$DB_NAME user=$DB_USER"
