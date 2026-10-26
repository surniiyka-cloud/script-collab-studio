# Script Collab Studio

Backend skeleton for the collaborative screenplay and storyboard application. **Stage 2 development backend acceptance checks passed in Codespaces on 2026-10-26; PR not merged or deployed.** Stage 1 architecture is tracked in [PR #1](https://github.com/surniiyka-cloud/script-collab-studio/pull/1).

## Stack

- Node.js 22+, pnpm workspaces; Fastify 5, Zod 4, PostgreSQL 17, Prisma 7.
- Hocuspocus 4 + Yjs with binary Yjs state persisted through PostgreSQL.
- Argon2id password hashing, JWT bearer access tokens, Owner/Editor/Viewer checks.
- React web client and object storage integration are later stages.

## Local development setup

```bash
corepack enable
pnpm install
cp .env.example apps/api/.env
# Replace JWT_SECRET with a unique generated value (32+ chars).
docker compose up -d postgres
pnpm --filter @studio/api db:migrate
pnpm --filter @studio/api db:generate
pnpm build
pnpm dev
```

API: `http://localhost:3001/api/v1` · WebSocket: `ws://localhost:3002`. `docker-compose.yml` starts **only infrastructure** (Postgres and MinIO); API starts with `pnpm dev`. Production database migration should use `db:deploy` after migration scripts are generated/reviewed.

**Important:** In Codespaces, `prisma migrate dev`, `prisma validate`, the backend build, HTTP smoke and the first multiuser Yjs smoke passed. The initial Prisma migration and `pnpm-lock.yaml` were subsequently pushed to the feature branch in commit `1ef26a4`. The fresh-DB migration replay and WebSocket Viewer/outsider authorization tests also passed in the latest Codespaces run. Never run `migrate dev` against a production database.

## One-command backend verification (after installing Docker and Node.js 22+)

From a Codespace or local shell on the feature branch:

```bash
bash scripts/verify-backend.sh
```

This development-only script installs dependencies, creates an ignored local `.env` with a random JWT secret if missing, starts PostgreSQL, runs Prisma migrations, builds, runs the dependency-free tests, launches the API and sends a real HTTP smoke test for registration, access control, scenes, nodes and edges. It creates **temporary test users** in the local DB and deletes its test project. It also verifies real-time multi-user WebSocket collaboration and Viewer permissions; it does **not** test a full server restart or live revocation of established WebSocket sessions, and must **never** point at production data. No API keys are required.

**Verified in Codespaces on 2026-10-26 (original test):** `pnpm build` passed, logic tests passed (5/5), PostgreSQL and Hocuspocus started, and HTTP smoke passed (8/8). **Verified in Codespaces:** the two-user Hocuspocus/Yjs persistence test passed **3/3**: mutual synchronization, persisted PostgreSQL binary state, and a third client's read of the merged text. **Verified in the latest Codespaces run:** committed SQL migration replayed successfully into a fresh temporary database, unaffiliated WebSocket access was rejected, and Viewer writes were denied. See [Stage 2 verification](docs/stage2-verification.md). The pnpm lockfile and initial Prisma migration are committed in the feature branch. Do not send the `.env` file or JWT token to anyone.

## Available Stage 2 endpoints

| Method | Path | Capability |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | Email/password and JWT token |
| GET | `/auth/me` | Current user |
| GET, POST | `/projects` | List/create projects |
| GET, PATCH, DELETE | `/projects/:projectId` | View/Owner edit/delete |
| GET, POST | `/projects/:projectId/scripts` | List/create scripts |
| GET, PATCH, DELETE | `/scripts/:scriptId` | Script metadata CRUD |
| GET, POST | `/scripts/:scriptId/acts` | List/create acts |
| GET, POST | `/scripts/:scriptId/scenes` | List/create scenes |
| GET, PATCH, DELETE | `/scenes/:sceneId` | Scene CRUD |
| GET | `/projects/:projectId/graph` | Nodes and edges |
| POST | `/projects/:projectId/nodes` | Add typed nodes |
| PATCH, DELETE | `/nodes/:nodeId` | Edit/remove nodes |
| POST | `/projects/:projectId/edges` | Add sequence/dependency/alternative edges |
| PATCH, DELETE | `/edges/:edgeId` | Edit label/remove edge |

All routes above (except `/health`, register/login) use Bearer JWT. Write access requires Owner/Editor; Owner-only changes project metadata and deletes project. Register and login now have **single-process, IP-based fixed-window throttling** (12 login/min, 6 register/min). This is for development; multi-replica deployments require a shared limiter (Redis/gateway). JWT refresh/rotation and invitations are scheduled for later stages.

### Dependency-free logic tests

From the repository root, with Node.js 22+: `node --experimental-strip-types --test apps/api/tests/graph.test.ts apps/api/tests/security.test.ts`. This does **not** validate Prisma, API integration, Hocuspocus or the full build.

### Minimal smoke usage

```bash
curl -sS -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"writer@example.test","password":"change-this-long-password","displayName":"Writer"}'
# Copy data.accessToken into TOKEN and then:
TOKEN='paste-access-token'
curl -sS http://localhost:3001/api/v1/projects -H "Authorization: Bearer $TOKEN"
```

### Collaboration protocol

Connect to WebSocket `ws://localhost:3002` with a HocuspocusProvider (`token: <JWT>`, `name: 'scene:<sceneUUID>'` or `graph:<projectUUID>`). Authentication verifies JWT and project membership; Viewer connections are read-only. Database extension saves/loads original Yjs binary update bytes, not JSON. Text editor schema and multi-user UI come in Stage 4. Structural Node/Edge updates go through REST; graph Yjs is reserved for layout/presence, not structural mutations.

## Testing and known limits

Codespaces verified `pnpm build` and five logic tests, plus a database-backed HTTP smoke test (8/8). The real-time Hocuspocus/Yjs integration test now also **passed 3/3** in Codespaces, including two connected editors and a fresh third connection. Passed: fresh-database migration replay, outsider WebSocket rejection, Viewer read-only checks. Still pending: full server-restart persistence test and later production hardening. The migration and pnpm lockfile are committed. **Do not assume production readiness.**

No secrets are committed: `.env.example` contains local placeholders only. Media uploads and AI endpoints will be added in later stages.
