# Stage 2 verification — 2026-10-26

**Status:** Codespaces build, Prisma validation, 5 logic tests, 8/8 database-backed HTTP checks, and **3/3 two-editor Yjs WebSocket/persistence checks passed**. Initial Prisma migration and pnpm lockfile are **committed and verified in GitHub** (commit `1ef26a4`). PR #2 remains draft while the new **fresh-DB migration replay** and **Viewer/outsider WebSocket access tests** await execution. This is not a production-readiness declaration.

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

**Second Codespaces run:** After `git pull --ff-only`, running the updated `bash scripts/verify-backend.sh` again also passed all 5 logic checks, 8 HTTP smoke steps and the newly added 3 WebSocket collaboration steps. The test printed `PASS: Two-user Hocuspocus/Yjs roundtrip + PostgreSQL binary-state persistence.` The terminal initially showed untracked `apps/api/prisma/migrations/`, `pnpm-lock.yaml`, and `package-lock.json`; the user subsequently validated Prisma successfully, committed only the migration and pnpm lockfile, and pushed commit `1ef26a4` to the feature branch. GitHub file readback verified both. `package-lock.json` is ignored in the pnpm monorepo.

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

- [x] Review and commit `pnpm-lock.yaml` and `apps/api/prisma/migrations/` on the feature branch; GitHub readback confirms commit `1ef26a4`. Do not commit `package-lock.json` or `.env`.
- [x] Run an **actual Yjs WebSocket integration test** for two authorized writers, merged state persisted in PostgreSQL, and a third synchronized connection. **Still pending:** Viewer read-only, denied cross-project access, and restart durability.
- [x] `pnpm --filter @studio/api exec prisma validate` passed: `The schema at prisma/schema.prisma is valid`.
- [ ] **New test (not executed):** `scripts/verify-fresh-db.sh` creates a random temporary database *inside the local Compose PostgreSQL*, calls `prisma migrate deploy` and `prisma migrate status` with its temporary `DATABASE_URL`, verifies seven core tables, and drops only that temporary database on exit.
- [ ] **New test (not executed):** extended `apps/api/scripts/collab-smoke.mjs` tests a rejected unaffiliated WebSocket token and Viewer read-only enforcement (no edits propagate to writers or persisted state).
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

The script starts local infrastructure and temporary test records. It now also runs `scripts/verify-fresh-db.sh` and the expanded Hocuspocus authorization tests; **these additions have not yet run in Codespaces**. The fresh-DB script provisions and drops only a randomly named test database on the local Docker Compose PostgreSQL service. Do not point it at production databases.
