#!/bin/bash
# Baut eine leere Testdatenbank und führt alle Prüfungen aus
P="psql -h /tmp/pgv -p 5544 -U postgres"
$P -q -c "drop database if exists t" -c "drop role if exists anon" -c "drop role if exists authenticated" 2>/dev/null
$P -q -c "create database t"
cd "$(dirname "$0")"
$P -q -d t -v ON_ERROR_STOP=1 -f test_stub.sql -f schema.sql -f migration_2.sql && $P -q -d t -f test.sql
