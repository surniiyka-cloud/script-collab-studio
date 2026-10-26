# Stage 2 verification — 2026-10-26

**Status (26 October 2026): Stage 2 development backend acceptance checks PASSED in GitHub Codespaces.** Successful TypeScript/Prisma build; Prisma schema validation; 5/5 logic tests; 8/8 HTTP integration steps; clean PostgreSQL migration replay from committed SQL; and expanded two-editor Yjs integration test covering outsider denial and Viewer read-only. Initial SQL migration and pnpm lockfile are committed in `1ef26a4`. **This does not establish production readiness or a working frontend.**

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
| Yjs/WebSocket integration | **PASS: 5/5 checkpoints** (3 original steps plus outsider denial and Viewer read-only enforcement) |
| Fresh PostgreSQL migration | **PASS** `prisma migrate deploy` against temporary `studio_verify_…` DB; `prisma migrate status` up to date; 7 core tables verified |

The observed HTTP 409 from rejecting a cycle and 404 for an unrelated account are **expected policy outcomes**. The script reported: `PASS: HTTP backend smoke (auth, project, script, scenes, nodes, edge, cycle, membership, deletion).`

**Previous Codespaces run:** After `git pull --ff-only`, running the updated `bash scripts/verify-backend.sh` again also passed all 5 logic checks, 8 HTTP smoke steps and the newly added 3 WebSocket collaboration steps. The test printed `PASS: Two-user Hocuspocus/Yjs roundtrip + PostgreSQL binary-state persistence.` The terminal initially showed untracked `apps/api/prisma/migrations/`, `pnpm-lock.yaml`, and `package-lock.json`; the user subsequently validated Prisma successfully, committed only the migration and pnpm lockfile, and pushed commit `1ef26a4` to the feature branch. GitHub file readback verified both. `package-lock.json` is ignored in the pnpm monorepo.

**Warning:** pnpm reported ignored postinstall scripts for `@prisma/engines`, `argon2`, `esbuild` and `prisma`. These did **not** block the observed build or smoke test. Do not approve arbitrary new dependency scripts without review. A clean-environment reproducibility check is advisable once the lockfile is committed.

## Verified earlier (without external dependencies)

- `node --experimental-strip-types --test apps/api/tests/graph.test.ts apps/api/tests/security.test.ts`: 5 passed.
- Fixed Hocuspocus v4 hook to use `connectionConfig.readOnly`; the Codespaces TypeScript build succeeded after this commit.
- Prisma v7 config and generated import extensions are in place.
- Editor/Owner vs Viewer logic, single-process login/register throttling, and Yjs scene record cleanup are implemented.

## Real-time collaboration verification (executed in Codespaces)

The latest `bash scripts/verify-backend.sh` completed all integration gates on the feature branch:

- **1/5:** two authorized editors connected to the same scene and received each other's Yjs changes.
- **2/5:** PostgreSQL `YDocState` held their combined CRDT text.
- **3/5:** a fresh third connection saw the merged screenplay.
- **4/5:** an unrelated user was denied WebSocket authentication (the `[onAuthenticate] Resource not found` message is expected).
- **5/5:** a project Viewer could read the scene but could not broadcast/persist its own edits.
- A disposable database named `studio_verify_…` was created using `prisma migrate deploy`; Prisma confirmed the migration applied and 7 core tables existed. The test cleaned up its temporary database.
- The log finished with `All local backend gates passed: clean-DB migration replay, HTTP API and WebSocket permissions.`

**Still not demonstrated by this test:** cold server-restart persistence/recovery and authorization revocation of *already-connected* WebSocket clients. These remain later hardening/quality tests.

## Still to complete before marking the backend stage finished

- [x] Review and commit `pnpm-lock.yaml` and `apps/api/prisma/migrations/` on the feature branch; GitHub readback confirms commit `1ef26a4`. Do not commit `package-lock.json` or `.env`.
- [x] Verify authorized two-writer Yjs collaboration, persisted PostgreSQL state, third-client re-sync, unrelated-user WebSocket rejection and Viewer read-only; cold server restart and live role-revocation remain outside this gate.
- [x] `pnpm --filter @studio/api exec prisma validate` passed: `The schema at prisma/schema.prisma is valid`.
- [x] `scripts/verify-fresh-db.sh` successfully replayed the committed migration into a temporary Compose PostgreSQL database, checked migration status and verified seven core tables.
- [x] Extended `apps/api/scripts/collab-smoke.mjs` passed unaffiliated-user WebSocket denial and Viewer read-only checks (no unauthorized mutations reached writers or persisted state).
- [x] The user's latest `git status --short` generated no entries in the supplied terminal log after a successful run; continue to keep `.env`, tokens and credentials out of Git.
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

The script was successfully executed in Codespaces, including `scripts/verify-fresh-db.sh` and the expanded Hocuspocus authorization tests. The fresh-DB script provisions and drops only a randomly named test database on the local Docker Compose PostgreSQL service. Do not point it at production databases.
