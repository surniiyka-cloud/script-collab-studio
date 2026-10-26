# Script Collab Studio

Backend skeleton for the collaborative screenplay and storyboard application. **Stage 2 working tree; not deployed or merged.** Stage 1 architecture is tracked in [PR #1](https://github.com/surniiyka-cloud/script-collab-studio/pull/1).

## Stack

- Node.js 22+, pnpm workspaces; Fastify 5, Zod 4, PostgreSQL 17, Prisma 7.
- Hocuspocus 4 + Yjs with binary Yjs state persisted through PostgreSQL.
- Argon2id password hashing, JWT bearer access tokens, Owner/Editor/Viewer checks.
- React web client and object storage integration are later stages.

## Setup (once dependency registry and Docker are available)

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

**Important:** Stage 2 has not yet produced an initial checked-in Prisma migration, because the package registry/Prisma CLI could not be reached in the current environment. Run `pnpm --filter @studio/api db:migrate` against development Postgres. Never run `migrate dev` on a production database.

## One-command backend verification (after installing Docker and Node.js 22+)

From a Codespace or local shell on the feature branch:

```bash
bash scripts/verify-backend.sh
```

This development-only script installs dependencies, creates an ignored local `.env` with a random JWT secret if missing, starts PostgreSQL, runs Prisma migrations, builds, runs the dependency-free tests, launches the API and sends a real HTTP smoke test for registration, access control, scenes, nodes and edges. It creates **temporary test users** in the local DB and deletes its test project. It does **not** verify multi-user WebSocket collaboration, and must **never** point at production data. No API keys are required.

If it passes, review/commit the generated `pnpm-lock.yaml` and Prisma migration in the feature branch before marking PR #2 ready. Do not send the `.env` file or JWT token to anyone.

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

Target checks: `pnpm build`, `pnpm test` and `pnpm --filter @studio/api typecheck` following install. The automated environment could not reach the npm registry and had no Docker, so full dependency build, `prisma validate` and database integration tests **were not run**. TypeScript syntax transpilation and pure graph algorithm tests were performed independently. Do **not** assume production readiness.

No secrets are committed: `.env.example` contains local placeholders only. Media uploads and AI endpoints will be added in later stages.
