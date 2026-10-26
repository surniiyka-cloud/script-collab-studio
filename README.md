# Script Collab Studio

A collaborative workspace for screenplay writing and storyboarding. **Stages 1 (architecture) and 2 (backend) are merged into `main`. Stage 3 (React frontend) is under review on `chatgpt/feature-frontend-shell`, not yet deployed.**

## Stack

- Node.js 22+, pnpm workspaces; Fastify 5, Zod 4, PostgreSQL 17, Prisma 7.
- Hocuspocus 4 + Yjs with binary Yjs state persisted through PostgreSQL.
- Argon2id password hashing, JWT bearer access tokens, Owner/Editor/Viewer checks.
- Stage 3 adds a React 19 / Vite 7 / Tailwind 4 web client. Rich-text Yjs editor, interactive React Flow and object storage uploads remain later stages.

## New project experience — Story-first wizard (draft PR #6)

The `chatgpt/rebuild-story-workflow` feature branch replaces the old project workbench with a single **five-step screenplay-to-visual-structure flow**:

1. Import a complete screenplay, inspect extracted scenes, dialogue speakers and original location/action descriptions before saving.
2. Select **multiple character photos at once**, then assign a name to each in the app.
3. Review identified locations; bulk-upload visual references and map each location to its scene. Edit location descriptions without altering the screenplay.
4. Plan individual scene shots with their full script context, then upload still images for each shot.
5. View a structured **story map** in authored scene order: location imagery, character references, spoken lines, action notes and photo storyboards.

All existing database content, users and media are **preserved**. The old page is replaced only on this feature branch; `main` remains unchanged. The system extracts what's written and does not fabricate scene facts or image-generation results. Follow [Story-first rebuild acceptance notes](docs/story-first-rebuild.md) to verify the branch in Codespaces. This is not yet a production build.

## Stage 5 — Script-to-Film production workflow (draft)

In the separate `chatgpt/feature-script-to-film-pipeline` branch, the project workspace gains **Производство** with four steps: upload/paste a complete screenplay (TXT/Fountain/MD/DOCX/selectable-text PDF), review scene/character parsing and commit to Yjs, attach named character reference images (private SeaweedFS S3), propose/approve per-scene shots, attach images/audio and preview an animatic. An optional local Ollama text model can propose shot lists. FFmpeg can create an MP4 **still-image animatic** from approved, illustrated shots; it is not a generative AI film.

**Stage 5 is NOT YET VERIFIED OR MERGED.** See [Script-to-Film implementation and tests](docs/script-to-film-implementation.md). Requirements for browser upload: PostgreSQL and SeaweedFS S3 from `docker compose up -d postgres objectstore`; append the local S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET entries from `.env.example` to your ignored `apps/api/.env`. Stage 5 requires fresh dependency installation and lockfile review in Codespaces. Run `bash scripts/verify-production.sh` for the API/media smoke after installation. Export MP4 requires a local FFmpeg binary.

Generation of new images, moving videos, composed music and voice-over remains a later, opt-in provider integration. No paid service is silently used and the imported author script is never silently rewritten.

## Stage 3 — web frontend (under review)

New `apps/web` provides Russian-language login/registration, live API-backed projects dashboard, screenplay/scene navigator and metadata editing, plus a read-only graph overview. This is a **real frontend shell**, not yet the collaborative Tiptap editor. Source and verification steps are in [Stage 3 verification](docs/stage3-verification.md).

From your Codespace on the `chatgpt/feature-frontend-shell` branch (Node.js 22+, pnpm, Docker and an ignored `apps/api/.env` with a strong local JWT secret):

```bash
pnpm install --no-frozen-lockfile
pnpm build
docker compose up -d postgres
pnpm dev
```

- Port **5173**: open the forwarded Vite web app in **Codespaces → Ports → Open in Browser**.
- Port **3001**: Fastify API; Vite proxies `/api` to the API, no public API token or password in Vite config.
- `pnpm dev` now starts frontend and backend concurrently. For one service: `pnpm dev:web` or `pnpm dev:api`.
- After installing web dependencies, review and commit the regenerated **`pnpm-lock.yaml`** on the feature branch; never include `.env` or secrets.
- `pnpm build` and manual browser flows **still require Codespaces verification** after the Stage 3 change.

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

API: `http://localhost:3001/api/v1` · WebSocket: `ws://localhost:3002`. `docker-compose.yml` starts **only infrastructure** (Postgres and SeaweedFS S3); API starts with `pnpm dev`. Production database migration should use `db:deploy` after migration scripts are generated/reviewed.

**Important:** In Codespaces, `prisma migrate dev`, `prisma validate`, the backend build, HTTP smoke and the first multiuser Yjs smoke passed. The initial Prisma migration and `pnpm-lock.yaml` were subsequently pushed to the feature branch in commit `1ef26a4`. The fresh-DB migration replay and WebSocket Viewer/outsider authorization tests also passed in the latest Codespaces run. Never run `migrate dev` against a production database.

## One-command backend verification (after installing Docker and Node.js 22+)

From a Codespace or local shell on the feature branch:

```bash
bash scripts/verify-backend.sh
```

This development-only script installs dependencies, creates an ignored local `.env` with a random JWT secret if missing, starts PostgreSQL, runs Prisma migrations, builds, runs the dependency-free tests, launches the API and sends a real HTTP smoke test for registration, access control, scenes, nodes and edges. It creates **temporary test users** in the local DB and deletes its test project. It also verifies real-time multi-user WebSocket collaboration and Viewer permissions; it does **not** test a full server restart or live revocation of established WebSocket sessions, and must **never** point at production data. No API keys are required.

**Verified in Codespaces on 2026-10-26 (backend tests):** `pnpm build` passed, logic tests passed (5/5), PostgreSQL and Hocuspocus started, and HTTP smoke passed (8/8). **Verified in Codespaces:** the two-user Hocuspocus/Yjs persistence test passed **3/3**: mutual synchronization, persisted PostgreSQL binary state, and a third client's read of the merged text. **Verified in the latest Codespaces run:** committed SQL migration replayed successfully into a fresh temporary database, unaffiliated WebSocket access was rejected, and Viewer writes were denied. See [Stage 2 verification](docs/stage2-verification.md). The pnpm lockfile and initial Prisma migration are committed in the feature branch. Do not send the `.env` file or JWT token to anyone.

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

No secrets are committed: `.env.example` contains local placeholders only. Frontend build/browser tests remain pending in Stage 3; media and AI endpoints will be added in later stages.
