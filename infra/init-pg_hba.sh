#!/bin/bash
# Update pg_hba.conf to use trust auth (no password) for all connections during dev
sed -i '$ s/host all all all scram-sha-256/host all all all trust/' /var/lib/postgresql/data/pg_hba.conf
echo "pg_hba.conf updated to use trust auth (development only)"


