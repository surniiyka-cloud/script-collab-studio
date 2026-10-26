#!/usr/bin/env bash
# Codespaces development-only integration check. Never point it at production resources.
set -euo pipefail
cd "$(dirname "$0")/.."
for command in node pnpm docker; do command -v "$command" >/dev/null || { echo "Missing $command" >&2; exit 1; }; done

pnpm install --no-frozen-lockfile
if [[ ! -f apps/api/.env ]]; then
  cp .env.example apps/api/.env
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    import { randomBytes } from "node:crypto";
    const file="apps/api/.env";
    writeFileSync(file,readFileSync(file,"utf8").replace(
      "REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS",randomBytes(48).toString("base64")));
  '
fi

docker compose up -d postgres objectstore
# Wait for both services: Compose reports containers started before S3 is ready.
for attempt in $(seq 1 60); do
  if node -e 'fetch("http://127.0.0.1:9000/").then(r=>process.exit([200,400,403].includes(r.status)?0:1)).catch(()=>process.exit(1))'; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then echo "Local S3 object store did not become ready" >&2; exit 1; fi
  sleep 1
done

pnpm --filter @studio/api db:migrate
pnpm build
pnpm test:logic

# Run API with local demo S3 credentials for this process only. No credentials are committed.
(
 cd apps/api
 S3_ENDPOINT=http://127.0.0.1:9000 \
 S3_ACCESS_KEY=localstudio \
 S3_SECRET_KEY=localstudio_dev_only \
 S3_BUCKET=studio-media \
 node dist/index.js
) &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT

for i in $(seq 1 45); do
  if node -e 'fetch("http://127.0.0.1:3001/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then break; fi
  if [[ "$i" == 45 ]]; then echo "API did not become ready" >&2; exit 1; fi
  sleep 1
done

pnpm --filter @studio/api test:production
printf '\nPASS: Production importer, storyboard, Yjs, timeline and private MinIO media smoke.\n'
