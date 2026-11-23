#!/bin/bash
set -e

echo "Generating secrets..."

REDIS_PASS=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
POSTGRES_PASS=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")

echo ""
echo "Add these to your ROOT .env:"
echo "REDIS_PASSWORD=$REDIS_PASS"
echo "POSTGRES_DB=payroll_db"
echo "POSTGRES_USER=payroll_user"
echo "POSTGRES_PASSWORD=$POSTGRES_PASS"
echo ""
echo "Add these to backend/.env:"
echo "SECRET_KEY=$SECRET_KEY"
echo "DATABASE_URL=postgres://payroll_user:$POSTGRES_PASS@db:5432/payroll_db"
echo "REDIS_URL=redis://:$REDIS_PASS@redis:6379/1"