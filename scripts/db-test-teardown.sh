#!/usr/bin/env bash
# FEAT-002 — tear down the local Docker Postgres e2e DB and discard its data.
# Used by `npm run db:test:teardown`. Resilient: a missing docker daemon is a
# clear, non-zero, single-line message (not a stack trace). When
# E2E_DATABASE_URL (external/Neon) is in use there is no Docker container to
# remove, so this is a no-op the user manages on the Neon side.
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"

if [ -n "${E2E_DATABASE_URL:-}" ] && [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "db:test:teardown: E2E_DATABASE_URL (external/Neon) is in use; nothing to tear down locally. Delete the Neon dev branch on the Neon side."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "db:test:teardown FAILED: missing dependency 'docker'. Nothing to tear down. See docs/postgres-e2e-env.md." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "db:test:teardown FAILED: the Docker daemon is not running/reachable. Nothing to tear down. See docs/postgres-e2e-env.md." >&2
  exit 1
fi

DOCKER_COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
  else
    echo "db:test:teardown FAILED: missing dependency 'docker compose'. See docs/postgres-e2e-env.md." >&2
    exit 1
  fi
fi

echo "db:test:teardown: stopping and removing the Postgres test container + volume ..."
$DOCKER_COMPOSE -f "$COMPOSE_FILE" down -v
echo "db:test:teardown: done."
