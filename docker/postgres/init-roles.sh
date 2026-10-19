#!/bin/sh
# Виконується один раз при першому створенні тому Postgres.
# Розділяє права: міграції міняють структуру, застосунок лише читає й пише дані.
set -e

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v app_pw="$APP_DB_PASSWORD" -v mig_pw="$MIGRATOR_DB_PASSWORD" <<'SQL'
CREATE ROLE statusdev_migrator LOGIN PASSWORD :'mig_pw';
CREATE ROLE statusdev_app LOGIN PASSWORD :'app_pw';

-- Звичайні користувачі не створюють нічого в public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO statusdev_migrator;
GRANT USAGE ON SCHEMA public TO statusdev_app;
GRANT CONNECT ON DATABASE statusdev TO statusdev_migrator, statusdev_app;
ALTER DATABASE statusdev OWNER TO statusdev_migrator;

-- Усе, що створить мігратор у майбутньому, застосунок отримає лише на DML.
ALTER DEFAULT PRIVILEGES FOR ROLE statusdev_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO statusdev_app;
ALTER DEFAULT PRIVILEGES FOR ROLE statusdev_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO statusdev_app;
SQL
