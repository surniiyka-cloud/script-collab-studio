# Stage 2 verification — 2026-10-26

**Status:** Full Codespaces build, database-backed HTTP smoke test, and five logic tests **passed** on `chatgpt/feature-backend-skeleton`. **Stage 2 PR stays draft** pending committed migration/lockfile and WebSocket collaboration validation. This is not a production-readiness declaration.

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

The observed HTTP 409 from rejecting a cycle and 404 for an unrelated account are **expected policy outcomes**. The script reported: `PASS: HTTP backend smoke (auth, project, script, scenes, nodes, edge, cycle, membership, deletion).`

**Warning:** pnpm reported ignored postinstall scripts for `@prisma/engines`, `argon2`, `esbuild` and `prisma`. These did **not** block the observed build or smoke test. Do not approve arbitrary new dependency scripts without review. A clean-environment reproducibility check is advisable once the lockfile is committed.

## Verified earlier (without external dependencies)

- `node --experimental-strip-types --test apps/api/tests/graph.test.ts apps/api/tests/security.test.ts`: 5 passed.
- Fixed Hocuspocus v4 hook to use `connectionConfig.readOnly`; the Codespaces TypeScript build succeeded after this commit.
- Prisma v7 config and generated import extensions are in place.
- Editor/Owner vs Viewer logic, single-process login/register throttling, and Yjs scene record cleanup are implemented.

## Prepared real-time integration test (NOT YET EXECUTED)

- Added `apps/api/scripts/collab-smoke.mjs` and dev-only `@hocuspocus/provider@4.7.1`.
- `bash scripts/verify-backend.sh` now runs the original 8-step HTTP smoke **and** the two-client WebSocket test.
- The new test registers two temporary users, creates a disposable scene, grants the second user Editor membership in the test fixture, verifies that both clients receive each other's edits, checks binary PostgreSQL `YDocState` contains both changes, and confirms a freshly connected client reads them.
- This code was authored but **not executed** in the assistant environment. It requires another Codespaces run to verify and may surface compatibility issues. It does not yet test Viewer read-only, denied cross-project WS access, or cold restart replay.

## Still to complete before marking the backend stage finished

- [ ] Commit/review `pnpm-lock.yaml` and `apps/api/prisma/migrations/` on the **feature** branch. They are absent from the remote branch as of this verification. The local Prisma message "Already in sync" does not prove that migration SQL is in Git.
- [ ] Run an **actual Yjs WebSocket integration test** for two authorized writers, Viewer read-only, denied cross-project access, and update persistence after reconnect/server restart. Seeing the WS listener print "Ready" is insufficient.
- [ ] Verify `pnpm --filter @studio/api exec prisma validate` on the committed schema and run smoke against a fresh test database from the checked-in migration.
- [ ] Review any new untracked files before staging; do not commit `.env`, tokens, or keys.
- [ ] Stage 1 PR #1 is still open; the backend draft PR #2 is stacked on the architecture branch and must be reviewed in that order.

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
