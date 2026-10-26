# Stage 2 verification — 2026-10-26

**Status:** implementation draft; not yet verified as runnable.

## Checks performed
- Source files and configuration reviewed locally.
- `node --test apps/api/tests/graph-runtime.test.mjs`: **2 passed, 0 failed** (uses `dist/graph.js` compiled from the current pure graph helper; no external dependencies).
- Prisma CLI auto-discovery config name corrected to `apps/api/prisma.config.ts`.
- Generated Prisma imports configured for TypeScript ESM using `importFileExtension = "ts"` and `rewriteRelativeImportExtensions`.

## Checks blocked / not claimed
- `pnpm install`, `pnpm build`, `prisma validate`, `prisma migrate dev`, and DB/WebSocket integration smoke tests: **not run**, due to npm registry DNS resolution failure (`EAI_AGAIN`).
- `docker compose up`: **not run**, Docker unavailable in this environment.
- Prisma migration SQL not committed; run `pnpm --filter @studio/api db:migrate` with local PostgreSQL during validation.

## Security before public deployment
- Add login/register request throttling, refresh-token rotation, email verification and project invitation flow.
- Review WebSocket auth expiration/revocation and persistent Yjs doc permissions.
- Replace `JWT_SECRET` in local environment; never commit real secrets.
- Apply and test cross-project access checks with an integration database.
- Public repository does not imply public production deployment or public user data.

These incomplete checks block calling Stage 2 **complete**. PR should remain draft until a maintainer performs installation, Prisma validation/migration and end-to-end smoke tests.
