#!/usr/bin/env bash
# FEAT-002 — bring up the local Docker Postgres e2e DB, migrate, and seed it.
#
# Resilient by design: if a required dependency is missing it exits NON-ZERO with
# a single clear, human-readable line NAMING the missing dependency (never a raw
# stack trace). Used by `npm run db:test:setup`.
#
# DB URL precedence: TEST_DATABASE_URL, then E2E_DATABASE_URL, else the local
# Docker default. When E2E_DATABASE_URL points at a Neon dev branch, the Docker
# step is skipped and the same migrate->seed flow runs against Neon
# (Vercel-realistic). See docs/postgres-e2e-env.md.
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"
LOCAL_DEFAULT_URL="postgresql://vedella:vedella@localhost:5433/vedella_test"

# Resolve the target DB URL.
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  TARGET_URL="$TEST_DATABASE_URL"
  USE_DOCKER=1
elif [ -n "${E2E_DATABASE_URL:-}" ]; then
  # A Neon dev branch (or any external Postgres) was supplied: skip Docker.
  TARGET_URL="$E2E_DATABASE_URL"
  USE_DOCKER=0
  echo "db:test:setup: using E2E_DATABASE_URL (external/Neon Postgres); skipping Docker."
else
  TARGET_URL="$LOCAL_DEFAULT_URL"
  USE_DOCKER=1
fi

if [ "$USE_DOCKER" -eq 1 ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "db:test:setup FAILED: missing dependency 'docker'. Install Docker, or set E2E_DATABASE_URL to a Neon dev branch. See docs/postgres-e2e-env.md." >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "db:test:setup FAILED: the Docker daemon is not running/reachable (docker CLI present but 'docker info' failed). Start Docker, or set E2E_DATABASE_URL to a Neon dev branch. See docs/postgres-e2e-env.md." >&2
    exit 1
  fi

  DOCKER_COMPOSE="docker compose"
  if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
      DOCKER_COMPOSE="docker-compose"
    else
      echo "db:test:setup FAILED: missing dependency 'docker compose' (neither 'docker compose' nor 'docker-compose' is available). See docs/postgres-e2e-env.md." >&2
      exit 1
    fi
  fi

  echo "db:test:setup: starting Postgres via $COMPOSE_FILE ..."
  $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d

  echo "db:test:setup: waiting for Postgres health ..."
  for i in $(seq 1 30); do
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T postgres-test pg_isready -U vedella -d vedella_test >/dev/null 2>&1; then
      echo "db:test:setup: Postgres is ready."
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "db:test:setup FAILED: Postgres did not become healthy within the timeout." >&2
      exit 1
    fi
    sleep 2
  done
fi

# The committed schema is Postgres; migrate deploy + seed against the target URL.
# DATABASE_URL (pooled) + DIRECT_URL (migrations) both map to the test URL.
export DATABASE_URL="$TARGET_URL"
export DIRECT_URL="$TARGET_URL"
export TEST_DATABASE_URL="$TARGET_URL"

echo "db:test:setup: applying migrations (prisma migrate deploy) ..."
npx prisma migrate deploy

echo "db:test:setup: seeding synthetic e2e fixtures ..."
npx tsx scripts/seed-e2e-postgres.ts

echo "db:test:setup: done. e2e Postgres ready at the configured TEST_DATABASE_URL."
