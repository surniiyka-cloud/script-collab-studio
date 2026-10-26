#!/usr/bin/env bash
# Stage 3 static build/typing checks; runtime browser/API verification is manual.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v pnpm >/dev/null || { echo "pnpm is not installed" >&2; exit 1; }
pnpm install --no-frozen-lockfile
pnpm --filter @studio/web typecheck
pnpm --filter @studio/web build
echo "PASS: Frontend TypeScript and Vite production bundle were built."
