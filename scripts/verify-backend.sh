#!/usr/bin/env bash
# Development-only end-to-end verification; requires Docker, Node 22+, corepack and npm registry access.
set -euo pipefail
cd "$(dirname "$0")/.."
for exe in node corepack docker; do
  command -v "$exe" >/dev/null || { echo "Missing $exe; install it before running" >&2; exit 1; }
done

corepack enable
if ! command -v pnpm >/dev/null; then echo "pnpm not available after corepack enable" >&2; exit 1; fi
pnpm install --no-frozen-lockfile

if [[ ! -f apps/api/.env ]]; then
  cp .env.example apps/api/.env
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    import { randomBytes } from "node:crypto";
    const file = "apps/api/.env";
    const data = readFileSync(file, "utf8");
    writeFileSync(file, data.replace("REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS", randomBytes(48).toString("base64")));
  '
  echo "Created untracked apps/api/.env with a random JWT secret (do not commit)."
fi

docker compose up -d postgres
pnpm --filter @studio/api db:migrate
pnpm build
pnpm test:logic
bash scripts/verify-fresh-db.sh

( cd apps/api && node dist/index.js ) &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  if node -e 'fetch("http://127.0.0.1:3001/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then
    break
  fi
  sleep 1
done
node scripts/smoke-backend.mjs
pnpm --filter @studio/api test:collab
printf '\nAll local backend gates passed: clean-DB migration replay, HTTP API and WebSocket permissions. Review the terminal output before marking the PR ready.\n'
