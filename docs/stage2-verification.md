# Stage 2 verification — 2026-10-26

**Status:** Full Codespaces build, 5 logic tests, 8/8 database-backed HTTP checks and **3/3 real two-client Yjs WebSocket/persistence checks passed** on `chatgpt/feature-backend-skeleton`. **Stage 2 PR stays draft** pending committed migration/lockfile and fresh-database migration replay. This is not a production-readiness declaration.

## Observed Codespaces results (user-supplied terminal output)

Executed: `bash scripts/verify-backend.sh` in a GitHub Codespace on the feature branch.

| Gate | Result |
| --- | --- |
| `pnpm install` | Successful, pnpm 10.28.1; reported ignored lifecycle build scripts |
| PostgreSQL | Container running; local `studio` database accessible |
| `prisma migrate dev --name init` | Successful; "Already in sync, no schema change or pending migration was found" |
| `prisma generate` | Successfully generated Prisma Client 7.10.1 |
| `pnpm build` | **PASS** (Prisma generate and TypeScript compiler completed, exit code 0) |
| `pnpm test:logic` | **PASS: 5 tests, 0 failures** (graph loops, throttling, role checks) |
| Fastify API | Listening at :3001; `/health/ready` responded 200 |
| Hocuspocus WS | v4.7.1 listening at :3002 |
| HTTP integration | **PASS: 8/8** project/script/two scenes/scene nodes/sequence edge/cycle denial/unauthorized isolation/deletion |
| Yjs/WebSocket integration | **PASS: 3/3** two authorized editors sync both changes; CRDT state persisted to PostgreSQL; third client reads merged text |

The observed HTTP 409 from rejecting a cycle and 404 for an unrelated account are **expected policy outcomes**. The script reported: `PASS: HTTP backend smoke (auth, project, script, scenes, nodes, edge, cycle, membership, deletion).`

**Second Codespaces run:** After `git pull --ff-only`, running the updated `bash scripts/verify-backend.sh` again also passed all 5 logic checks, 8 HTTP smoke steps and the newly added 3 WebSocket collaboration steps. The test printed `PASS: Two-user Hocuspocus/Yjs roundtrip + PostgreSQL binary-state persistence.` The terminal showed these untracked files: `apps/api/prisma/migrations/`, `pnpm-lock.yaml`, and `package-lock.json`. The Prisma migration and pnpm lockfile are needed in Git; the npm lockfile is not (pnpm is the chosen package manager).

**Warning:** pnpm reported ignored postinstall scripts for `@prisma/engines`, `argon2`, `esbuild` and `prisma`. These did **not** block the observed build or smoke test. Do not approve arbitrary new dependency scripts without review. A clean-environment reproducibility check is advisable once the lockfile is committed.

## Verified earlier (without external dependencies)

- `node --experimental-strip-types --test apps/api/tests/graph.test.ts apps/api/tests/security.test.ts`: 5 passed.
- Fixed Hocuspocus v4 hook to use `connectionConfig.readOnly`; the Codespaces TypeScript build succeeded after this commit.
- Prisma v7 config and generated import extensions are in place.
- Editor/Owner vs Viewer logic, single-process login/register throttling, and Yjs scene record cleanup are implemented.

## Real-time collaboration verification (executed in Codespaces)

- `apps/api/scripts/collab-smoke.mjs` ran successfully through `bash scripts/verify-backend.sh`.
- **1/3:** two authorized editors connected to the same scene; each received the other's Yjs change.
- **2/3:** `YDocState` in PostgreSQL contained both edits after the Hocuspocus persistence debounce.
- **3/3:** a freshly connected client obtained the merged screenplay.
- Confirmed: live roundtrip and persisted database state **in the same running server process**. **Not proven:** data restoration after a full process restart, Viewer write denial over WS, a cross-project WS rejection, or a brand-new database replay from the committed migration.

## Still to complete before marking the backend stage finished

- [ ] Review and commit `pnpm-lock.yaml` and `apps/api/prisma/migrations/` on the **feature** branch. Their presence as untracked Codespaces files does not make them part of the GitHub PR. Do not commit `package-lock.json` or `.env`.
- [x] Run an **actual Yjs WebSocket integration test** for two authorized writers, merged state persisted in PostgreSQL, and a third synchronized connection. **Still pending:** Viewer read-only, denied cross-project access, and restart durability.
- [ ] Run `pnpm --filter @studio/api exec prisma validate` and verify a clean test database initializes from the checked-in migration. Prisma `migrate dev` passed against the existing Codespaces database.
- [ ] Review any new untracked files before staging; do not commit `.env`, tokens, or keys.
- [ ] Stage 1 PR #1 remains open; backend draft PR #2 is stacked on the architecture branch and must be reviewed in that order.

## Security & deployment boundaries

- Development-only fixed-window rate limiter is in-process; multi-replica deployments require a shared limiter.
- API currently lacks refresh-token rotation, email verification and invitations. Do not deploy as a public production service yet.
- Recheck WebSocket access control and document lifetime/revocation in a live integration test.
- No real credentials belong in a public GitHub repository.
- Frontend and end-user collaborative editing are subsequent stages and are not implemented by this backend smoke.

## Reproduction

From repository root with Node 22+, pnpm and Docker (development environment only):

```bash
bash scripts/verify-backend.sh
pnpm --filter @studio/api exec prisma validate
git status --short
find apps/api/prisma/migrations -type f
```

The script starts local infrastructure and temporary test records. Do not point it at production databases.
