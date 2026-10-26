# Script Collab Studio — Architecture & Data Model

> **Status:** Stage 1 proposal (documentation only). **Date:** 2026-10-26. **Decision state:** awaiting owner review. No application code is shipped in this stage.

## 1. Product scope and vertical slice

Script Collab Studio is a project workspace for screenwriters, directors and small production teams. A **Scene has one stable identity** across the screenplay, storyboard, media, comments and AI results. The text editor and graph are two views over the same scenes, **not two competing documents**.

The first functional vertical slice (delivered across stages 2–7) is:

1. Sign up/sign in with email + password; create project and screenplay.
2. Create two scenes, edit screenplay paragraphs, see linked Scene nodes.
3. Connect Scene nodes with a SEQUENCE edge (without losing screenplay order).
4. Attach one image to a scene via object storage.
5. Request an AI shot breakdown, review it and accept its Shot nodes.
6. Two authorized editors open one scene and collaboratively edit it with live cursors and durable CRDT state.

Not in MVP: native apps, video editing, billing, advanced multi-track timeline, external OAuth, offline-first conflict-free structural edits across all entities, and AI image/video generation.

## 2. Architecture and locked choices

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Monorepo | pnpm workspaces | Shared contracts and simple local development; no Turborepo initially |
| Web | React 19, TypeScript, Vite 7 | SPA, routing, app shell |
| UI | Tailwind CSS 4 CSS-first `@theme`, shadcn/ui, lucide-react | Tokens, accessible components, dark/light themes |
| Script | Tiptap + Yjs + Hocuspocus provider | Screenplay-specific rich-text nodes and multi-user editing |
| Storyboard | @xyflow/react (React Flow), dnd-kit for non-canvas lists | Scene/Shot/Context nodes, connections, panning, keyboard controls |
| API | Node.js + Fastify + TypeScript + Zod | Auth, RBAC, CRUD, AI, uploads |
| Realtime | Yjs + Hocuspocus on Node.js/WebSocket | CRDT text, live awareness and graph-layout document |
| DB | PostgreSQL + Prisma | Structured data, ACL, metadata, binary Yjs documents and revisions |
| Object store | MinIO locally / S3-compatible production | Private image/audio objects via short-lived signed URLs |
| AI | Server-side AIProvider interface | Configurable OpenAI/Anthropic/local adapter; no browser credentials |
| Deploy | Vercel (web), Railway or Render (API + WS + managed Postgres) | Persistent WS runtime and DB |

Prefer **one Fastify service process plus a Hocuspocus WebSocket listener** in one apps/api deployable initially. Separate them only when scaling/load isolation is justified. Database remains private to the backend. Server-to-server provider calls only.

Prisma schema syntax to be validated against the selected, pinned Prisma major during stage 2; database URL belongs in environment / Prisma configuration, never in version-controlled secrets.

### Workspace structure (target; not implemented yet)

~~~text
/
├── apps/
│   ├── web/             # React SPA, routes, screen editor, React Flow
│   └── api/             # Fastify, Prisma, Hocuspocus, uploads, AI
├── packages/
│   ├── shared/          # Zod schemas, DTOs, enums, common types
│   └── ui/              # Add only when real cross-app reuse appears
├── docs/
│   └── architecture.md
├── docker-compose.yml  # App + Postgres + MinIO (later stage)
├── pnpm-workspace.yaml
├── package.json
├── .env.example         # Placeholders only; no secrets
├── README.md
├── .gitignore
└── LICENSE
~~~

Do not create empty packages only to match a diagram. Initially shared types can be in packages/shared; add packages/ui on demand.

## 3. Ownership and consistency invariants

1. **Structural source of truth:** PostgreSQL owns Project, Script, Act, Scene identity and canonical sort order; Node and Edge identity/type/references; Media, Character, Location, permissions, AI jobs and comments. Only API transactions may mutate them.
2. **Rich-text source of truth:** one Yjs document per scene, named `scene:<sceneUuid>`. Screenplay paragraphs (scene heading, action, character, dialogue, parenthetical, transition) reside in Y.XmlFragment/Tiptap schema. `YDocState.update` is persisted as the **Yjs binary state**, not reserialized editor JSON. A text/plain or Fountain projection is derived, not separately edited.
3. **Graph movement:** one Yjs graph-layout document per project (`graph:<projectUuid>`) stores collaborative node positions and selection presence. `Node.positionX/Y` are an asynchronously refreshed **read projection** for previews/non-realtime queries; CRDT layout wins on reconnect. Node existence, fields and edge links are not duplicated as independent mutable Y.Map objects.
4. **Structural graph changes:** POST/PATCH/DELETE calls go through the API and emit project-scoped invalidation events (SSE/WS or query revalidation) to refresh node/edge metadata; no client may bypass RBAC via a Yjs connection.
5. **Screenplay order vs graph order:** `Scene.sortKey` remains canonical screenplay order. A SEQUENCE edge expresses a proposed narrative relationship; edges alone do not reorder screenplay text. Graph UI marks disagreement and offers explicit `Apply linear order`, validated and applied atomically by API. ALTERNATIVE edges never automatically reorder scenes.
6. Cross-project relations are rejected by API validation/transactions even where a simple SQL foreign key cannot express cross-table project membership.
7. Each comment is anchored to a scene paragraph using serialized Yjs RelativePosition for start/end and a fallback quote; revisions are durable binary checkpoints. Resolving comments is a DB mutation pushed to subscribed clients.
8. A user with Viewer role can read and comment only if policy permits; for MVP Viewer is **read-only**, Editor/Owner may comment. Presence is advisory, not a security control.
9. Retrying create operations uses an idempotency key where needed (especially AI and media finalize), and updates use optimistic concurrency for DB metadata. CRDT text is merged by Yjs, not overwritten by REST PUT.

### Typical data flows

**Text edit:** browser Tiptap → Yjs document → authenticated Hocuspocus WebSocket → peer Yjs updates → debounced Hocuspocus load/store → Postgres YDocState binary → periodic Revision checkpoint. Presence/awareness is ephemeral; not stored.

**Node edit:** browser React Flow → REST API (metadata/add/remove edges) → transaction + RBAC + graph validation → Postgres → project-scoped invalidation → refetch. Node dragging → Y.Map layout document → Hocuspocus → Postgres binary; a background projector updates Node.positionX/Y.

**AI breakdown:** user selects scene and explicitly requests operation → backend reads authorized scene's projected text → AIProvider → structured Zod-validated draft in AIJob.result → UI preview → user explicitly accepts → transactional Shot nodes and SEQUENCE edges (idempotent). No AI result silently overwrites the screenplay.

**Media:** browser requests upload intent → API authorizes project and MIME/size → signed upload to private S3/MinIO → finalize verifies object → MediaAsset row → MediaLink row attaching to scene or node. Downloads are signed read URLs only.

## 4. Data model / Prisma design proposal

Identifiers use UUID; timestamps use UTC; every list query is scoped by project membership. The following is a **schema design draft**, not an installed/migrated schema. In stage 2 implement it under apps/api/prisma/schema.prisma, pin Prisma version and run `prisma validate` / migration tests. Database connection is configured outside the schema for Prisma versions requiring prisma.config.ts.

~~~prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum ProjectRole { OWNER EDITOR VIEWER }
enum NodeKind { SCENE SHOT LOCATION CHARACTER AUDIO }
enum EdgeKind { SEQUENCE DEPENDENCY ALTERNATIVE }
enum ShotType { WIDE MEDIUM CLOSE_UP EXTREME_CLOSE_UP OTS POV INSERT OTHER }
enum MediaKind { IMAGE AUDIO }
enum MediaLinkRole { REFERENCE STORYBOARD_FRAME SCENE_COVER SOUNDTRACK }
enum AIJobKind { BREAKDOWN STORYBOARD LOGIC_CHECK CHAT }
enum AIJobStatus { QUEUED RUNNING SUCCEEDED FAILED CANCELLED }

model User {
  id                 String              @id @default(uuid()) @db.Uuid
  email              String              @unique
  passwordHash       String
  displayName        String
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  ownedProjects      Project[]           @relation("ProjectOwner")
  memberships        ProjectMember[]
  sessions           Session[]
  sentInvitations    ProjectInvitation[] @relation("InvitationSender")
  authoredComments   Comment[]           @relation("CommentAuthor")
  resolvedComments   Comment[]           @relation("CommentResolver")
  revisions          Revision[]
  aiJobs             AIJob[]
  uploadedAssets     MediaAsset[]
}

model Session {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @db.Uuid
  refreshTokenHash String    @unique
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, expiresAt])
}

model Project {
  id          String              @id @default(uuid()) @db.Uuid
  title       String
  description String?
  ownerId     String              @db.Uuid
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  owner       User                @relation("ProjectOwner", fields: [ownerId], references: [id])
  members     ProjectMember[]
  invitations ProjectInvitation[]
  scripts     Script[]
  nodes       Node[]
  edges       Edge[]
  mediaAssets MediaAsset[]
  locations   Location[]
  characters  Character[]
  comments    Comment[]
  yDocs       YDocState[]
  revisions   Revision[]
  aiJobs      AIJob[]
}

model ProjectMember {
  projectId String      @db.Uuid
  userId    String      @db.Uuid
  role      ProjectRole
  joinedAt  DateTime    @default(now())
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
  @@index([userId])
}

model ProjectInvitation {
  id          String      @id @default(uuid()) @db.Uuid
  projectId   String      @db.Uuid
  invitedById String      @db.Uuid
  email       String
  tokenHash   String      @unique
  role        ProjectRole
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime    @default(now())
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  invitedBy   User        @relation("InvitationSender", fields: [invitedById], references: [id])
  @@index([projectId, email])
}

model Script {
  id        String   @id @default(uuid()) @db.Uuid
  projectId String   @db.Uuid
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  acts      Act[]
  scenes    Scene[]
  @@index([projectId])
}

model Act {
  id        String   @id @default(uuid()) @db.Uuid
  scriptId  String   @db.Uuid
  title     String
  sortKey   String
  script    Script   @relation(fields: [scriptId], references: [id], onDelete: Cascade)
  scenes    Scene[]
  @@unique([scriptId, sortKey])
}

model Scene {
  id          String           @id @default(uuid()) @db.Uuid
  scriptId    String           @db.Uuid
  actId       String           @db.Uuid
  title       String
  synopsis    String?
  sortKey     String
  locationId  String?          @db.Uuid
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  script      Script           @relation(fields: [scriptId], references: [id], onDelete: Cascade)
  act         Act              @relation(fields: [actId], references: [id], onDelete: Cascade)
  location    Location?        @relation(fields: [locationId], references: [id], onDelete: SetNull)
  characters  SceneCharacter[]
  nodes       Node[]
  mediaLinks  MediaLink[]
  comments    Comment[]
  revisions   Revision[]
  aiJobs      AIJob[]
  @@unique([actId, sortKey])
  @@index([scriptId])
}

model Location {
  id          String   @id @default(uuid()) @db.Uuid
  projectId   String   @db.Uuid
  name        String
  description String?
  notes       String?
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  scenes      Scene[]
  @@index([projectId])
}

model Character {
  id          String           @id @default(uuid()) @db.Uuid
  projectId   String           @db.Uuid
  name        String
  description String?
  notes       String?
  project     Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  scenes      SceneCharacter[]
  @@index([projectId])
}

model SceneCharacter {
  sceneId     String    @db.Uuid
  characterId String    @db.Uuid
  scene       Scene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@id([sceneId, characterId])
}

model Node {
  id          String      @id @default(uuid()) @db.Uuid
  projectId   String      @db.Uuid
  sceneId     String?     @db.Uuid
  kind        NodeKind
  title       String
  description String?
  shotType    ShotType?
  durationMs  Int?
  positionX   Float       @default(0)
  positionY   Float       @default(0)
  metadata    Json?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  scene       Scene?      @relation(fields: [sceneId], references: [id], onDelete: SetNull)
  outgoing    Edge[]      @relation("EdgeSource")
  incoming    Edge[]      @relation("EdgeTarget")
  mediaLinks  MediaLink[]
  comments    Comment[]
  @@index([projectId, kind])
  @@index([sceneId])
}

model Edge {
  id           String   @id @default(uuid()) @db.Uuid
  projectId    String   @db.Uuid
  sourceNodeId String   @db.Uuid
  targetNodeId String   @db.Uuid
  kind         EdgeKind
  label        String?
  createdAt    DateTime @default(now())
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  source       Node     @relation("EdgeSource", fields: [sourceNodeId], references: [id], onDelete: Cascade)
  target       Node     @relation("EdgeTarget", fields: [targetNodeId], references: [id], onDelete: Cascade)
  @@unique([sourceNodeId, targetNodeId, kind])
  @@index([projectId, kind])
  @@index([targetNodeId])
}

model MediaAsset {
  id           String      @id @default(uuid()) @db.Uuid
  projectId    String      @db.Uuid
  uploadedById String      @db.Uuid
  kind         MediaKind
  filename     String
  mimeType     String
  objectKey    String      @unique
  sizeBytes    BigInt
  tags         String[]
  createdAt    DateTime    @default(now())
  project      Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  uploadedBy   User        @relation(fields: [uploadedById], references: [id])
  links        MediaLink[]
  @@index([projectId, kind])
}

model MediaLink {
  id           String        @id @default(uuid()) @db.Uuid
  mediaAssetId String        @db.Uuid
  sceneId      String?       @db.Uuid
  nodeId       String?       @db.Uuid
  role         MediaLinkRole
  asset        MediaAsset    @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)
  scene        Scene?        @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  node         Node?         @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  @@index([sceneId])
  @@index([nodeId])
}

model Comment {
  id           String    @id @default(uuid()) @db.Uuid
  projectId    String    @db.Uuid
  authorId     String    @db.Uuid
  resolvedById String?   @db.Uuid
  sceneId      String?   @db.Uuid
  nodeId       String?   @db.Uuid
  parentId     String?   @db.Uuid
  body         String
  anchor       Json?
  mentions     String[]
  resolvedAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  author       User      @relation("CommentAuthor", fields: [authorId], references: [id])
  resolver     User?     @relation("CommentResolver", fields: [resolvedById], references: [id])
  scene        Scene?    @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  node         Node?     @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  parent       Comment?  @relation("CommentThread", fields: [parentId], references: [id], onDelete: Cascade)
  replies      Comment[] @relation("CommentThread")
  @@index([projectId, resolvedAt])
  @@index([sceneId])
  @@index([nodeId])
}

model YDocState {
  documentName String   @id
  projectId    String   @db.Uuid
  update       Bytes
  version      Int      @default(1)
  updatedAt    DateTime @updatedAt
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId])
}

model Revision {
  id          String   @id @default(uuid()) @db.Uuid
  projectId   String   @db.Uuid
  sceneId     String   @db.Uuid
  createdById String?  @db.Uuid
  label       String?
  snapshot    Bytes
  createdAt   DateTime @default(now())
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  scene       Scene    @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  createdBy   User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
  @@index([sceneId, createdAt])
}

model AIJob {
  id          String      @id @default(uuid()) @db.Uuid
  projectId   String      @db.Uuid
  sceneId     String?     @db.Uuid
  userId      String      @db.Uuid
  kind        AIJobKind
  status      AIJobStatus @default(QUEUED)
  provider    String?
  inputHash   String
  result      Json?
  error       String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  scene       Scene?      @relation(fields: [sceneId], references: [id], onDelete: SetNull)
  user        User        @relation(fields: [userId], references: [id])
  @@index([projectId, createdAt])
}
~~~

### Database constraints not captured by plain Prisma relations

- Project owner must have exactly one ProjectMember row with role OWNER. The service creates both in one transaction; membership roles and ownerId cannot drift.
- ProjectInvitation never grants OWNER role. Emails are normalized; invitations expire and can be used once.
- Scene.scriptId must match Scene.act.scriptId. Location and Character must belong to the same project as the screenplay.
- Node.kind=SCENE requires sceneId. SHOT should reference a scene. The scene must belong to Node.projectId. Shot-specific fields only apply to SHOT.
- Edge project and both endpoint node projects must match. Reject self-edges. For SEQUENCE, reject cycles in the canonical branch; allow explicitly flagged alternatives via ALTERNATIVE.
- MediaLink must reference **exactly one** of sceneId/nodeId; asset and target must share a project. Use PostgreSQL CHECK constraint via migration and API validation.
- Comment target must be exactly one of sceneId/nodeId for root comments; reply comments inherit target and project from parent; all mention IDs are validated as project members.
- Implement deletion semantics with project-level transaction and S3 orphan cleanup queue. DB cascade is not equivalent to deleting S3 objects.
- Invitation and AI jobs require rate limits; AI accept is idempotent so duplicate clicks do not create duplicate shots.

## 5. API contract (versioned at /api/v1)

All writes except login/register require authorization. Response envelopes: `{ data, meta? }` on success and `{ error: { code, message, details? }, requestId }` on failure. DTOs are defined as Zod schemas in packages/shared and used on both ends. Default pagination is cursor-based. Workspace scope is derived/verified from DB membership, never trusted from request body.

| Method | Route | Description / minimum role |
| --- | --- | --- |
| POST | /auth/register | Email/password registration (public, rate-limited) |
| POST | /auth/login | Session/access-token issuance (public, rate-limited) |
| POST | /auth/refresh | Rotate refresh session (authenticated cookie) |
| POST | /auth/logout | Revoke refresh session |
| GET | /auth/me | Current user |
| GET/POST | /projects | List mine / create (authenticated) |
| GET/PATCH/DELETE | /projects/:projectId | Read; edit/delete Owner only |
| GET/POST | /projects/:projectId/members | List / invite, Owner only for invitation |
| PATCH/DELETE | /projects/:projectId/members/:userId | Change role / remove, Owner only |
| POST | /invitations/:token/accept | Accept invite as authenticated email owner |
| GET/POST | /projects/:projectId/scripts | List / create; Viewer / Editor+ |
| GET/PATCH/DELETE | /scripts/:scriptId | Read / update / delete; Editor+ for writes |
| GET/POST | /scripts/:scriptId/acts | List / create; Editor+ writes |
| PATCH/DELETE | /acts/:actId | Rename/reorder / remove, Editor+ |
| GET/POST | /scripts/:scriptId/scenes | List / create; Editor+ writes |
| GET/PATCH/DELETE | /scenes/:sceneId | Metadata/synopsis, not rich-text overwrite |
| POST | /scripts/:scriptId/scenes/reorder | Atomic validated sortKey reorder, Editor+ |
| GET | /scenes/:sceneId/export?format=fountain | Server derived export from Yjs snapshot |
| GET | /projects/:projectId/graph | Graph nodes/edges plus projection positions |
| POST | /projects/:projectId/nodes | Add Scene/Shot/context node, Editor+ |
| PATCH/DELETE | /nodes/:nodeId | Update metadata / remove, Editor+ |
| POST | /projects/:projectId/edges | Add typed link, Editor+ |
| PATCH/DELETE | /edges/:edgeId | Update label/type / remove, Editor+ |
| POST | /projects/:projectId/graph/apply-order | Validate linear path and reorder scenes transactionally |
| GET/POST | /projects/:projectId/locations | List/create locations |
| GET/PATCH/DELETE | /locations/:locationId | Read/edit/remove location |
| GET/POST | /projects/:projectId/characters | List/create characters |
| GET/PATCH/DELETE | /characters/:characterId | Read/edit/remove character |
| POST | /projects/:projectId/media/upload-intent | Get private presigned upload URL |
| POST | /projects/:projectId/media/complete | Verify object and create MediaAsset |
| GET | /projects/:projectId/media | Search/filter/paginate assets |
| GET/DELETE | /media/:assetId | Details/signed read / deletion |
| POST/DELETE | /media/:assetId/links | Attach/detach to scene/node |
| GET/POST | /projects/:projectId/comments | List/create, scoped by scene/node |
| PATCH/DELETE | /comments/:commentId | Edit/resolve/reopen/delete per policy |
| POST | /ai/breakdown | Scene ID → typed draft shot list; Editor+ |
| POST | /ai/suggest-storyboard | Scene ID → draft nodes + edges; Editor+ |
| POST | /ai/check-logic | Explicit selected scene/graph IDs → findings |
| POST | /ai/chat | Explicit selection + user message; no silent full project read |
| GET | /ai/jobs/:jobId | Authorized polling of structured result |
| POST | /ai/jobs/:jobId/accept | Transactionally materialize draft nodes; Editor+ |
| GET | /health/live | Process live (no private details) |
| GET | /health/ready | DB + storage readiness (no private details) |

**Realtime endpoint:** `GET /collab?documentName=scene:<id>` (WebSocket; equivalent `graph:<projectId>`) served by Hocuspocus on an independently configured WS port / proxy route. Use a short-lived audience-scoped WS token. On each connection, authenticate via Hocuspocus `onAuthenticate`, resolve project ID from documentName and enforce Editor/Owner for write, Viewer as read-only. Recheck on reconnect and after role changes; close/restrict connections after revocation. Use Yjs awareness for cursors/presence; don't persist awareness.

**Versioning:** `Revision` snapshots are created at explicit checkpoints and periodically (e.g. every several minutes if changed); snapshot compare is not in MVP. Restore creates a **new** revision after authorization rather than deleting history.

### AI contract (example)

~~~json
{
  "jobId": "uuid",
  "sceneId": "uuid",
  "shots": [
    {
      "ordinal": 1,
      "description": "Wide establishing shot of a misty lakeshore",
      "shotType": "WIDE",
      "durationMs": 5000,
      "notes": "Subject enters at frame left"
    }
  ],
  "warnings": []
}
~~~

Validate model output with Zod and reject/repair malformed responses before exposing an accept action. If no provider configured, `POST /ai/breakdown` may use a clearly labeled deterministic **demo/beta breakdown** only when explicitly enabled; never pretend it came from an LLM.

## 6. Editor, graph, context and UX rules

**Screenplay:** Tiptap custom screenplay nodes: sceneHeading, action, character, dialogue, parenthetical, transition. Scene boundaries are DB Scene records; each scene's rich text is one Yjs document. Editor keyboard shortcuts, autosave status (`Saving / Saved / Offline`), collaboration avatars, comment marks/anchors and read-only Viewer mode. Fountain export maps typed paragraphs; PDF export uses a later simple server template.

**Graph:** React Flow infinite canvas, Controls + MiniMap, keyboard manipulation, selectable custom nodes with ARIA labels; typed edges and distinct visual cues for SEQUENCE, DEPENDENCY, ALTERNATIVE. Graph is browsable even before images are uploaded. Undo/redo: Y.UndoManager for text/layout; command history for validated graph structural REST changes (revert actions, not blind local state rewind). Visual warnings for screenplay order mismatch.

**Media:** Scene and node inspectors display their linked image/audio, relevant location and characters. Asset upload requires maximum size/MIME whitelist, quotas, sanitized display name, signed URLs; never serve private bucket as public website assets.

**Visual structure:** Desktop 3-pane layout: left navigator, middle editor/canvas with tab switch, right inspector / media / AI. Dark as default, light option with persisted user preference, use shadcn/ui and Tailwind 4 `@theme` tokens. Tablet collapses sidebars. Mobile is view/comment mode. Aim for WCAG 2.1 AA contrast, focus order and accessible graph operations.

**UI routes:** `/login`, `/projects`, `/projects/:projectId/script/:scriptId`, `/projects/:projectId/board`, `/projects/:projectId/media`, `/projects/:projectId/settings`.

## 7. Security, privacy, operations

- Hash passwords using Argon2id; short-lived access token + rotated HttpOnly Secure SameSite refresh cookie. Configure CORS and CSRF protection appropriately for deployed origins.
- RBAC on **every** REST handler and Yjs document read/write; project-UUID isolation and rate limits. User-provided documentName is never an authorization bypass. Default deny.
- Treat uploaded filenames/MIME as untrusted; verify content signature and object size, reject unsafe types, antivirus hook when available. Store private bucket/object keys.
- AI receives only explicitly selected scene/context and job metadata. Job logs avoid raw screenplay/prompts, user secrets and auth tokens. Configurable retention/deletion.
- Use environment names such as DATABASE_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, SESSION_SECRET, AI_PROVIDER, OPENAI_API_KEY, ANTHROPIC_API_KEY, LOCAL_AI_URL; include only blank example placeholders in .env.example in stage 2.
- Backup PostgreSQL including YDocState binary; retain MinIO/S3 objects separately. Migrations run as controlled deploy step. Structured logs with request IDs, health endpoints, graceful WS shutdown.
- Validate that deployment provider supports durable WebSockets. Do not host Hocuspocus inside Vercel serverless functions.
- Pin compatible package versions and commit pnpm-lock.yaml after installing packages; verify npm/pnpm build and typecheck in implementation PRs.
- Branch discipline: no direct writes to main; `chatgpt/feature-*` branches; human-reviewed PRs; no auto-merge; do not modify .github/workflows or secrets without approval. Owner should enable branch protection/ruleset on main (PR required, prohibit force-push and deletion); connector currently does not expose a protection-rule write/check API.

## 8. Stage sequence and acceptance gates

Each stage starts **only after owner approval** of prior stage. A PR does not imply merge. Do not conflate “documented” with “implemented”.

| Stage | PR scope | Acceptance criterion |
| --- | --- | --- |
| 1. Architecture | This document + README entry | Data invariants, API surface, phase order and choices approved |
| 2. Backend | Fastify, Prisma migration, Postgres, CRUD Project/Script/Scene/Node/Edge; Hocuspocus | `pnpm build`, API smoke tests, auth isolation, binary Yjs persistence |
| 3. Frontend shell | Vite + React + Tailwind + shadcn/ui, routes, auth, three-panel shell | Login, protected navigation, dark/light tokens, `pnpm build` |
| 4. Screenplay | Tiptap schema, Yjs, presence, autosave, comments baseline, Fountain | Two-user concurrent text edit without loss, restart persistence |
| 5. Storyboard | React Flow Scene/Shot nodes, edges, graph order warnings | Two scenes shown, connect/reorder with explicit confirmation |
| 6. Media | S3/MinIO upload, gallery, tags, links, inspector | Attach/retrieve a private image on scene/node |
| 7. AI | Provider interface, structured breakdown and storyboard drafts, accept | Breakdown produces valid typed shot list and accepted Shot nodes |
| 8. Polish | Tablet/mobile read mode, accessibility, error handling, docs, Docker setup | `docker compose up --build`, smoke E2E for the full vertical slice |

**Build gate for stage 1:** N/A — README + architecture documentation only; there is no package.json or application build script. Starting stage 2, every implementation PR must record the actual build/test outcome and keep README current.

## 9. Stage 1 review checklist

- [x] Private repository exists with README.md, Node.js .gitignore and MIT LICENSE.
- [x] Architecture, persistence ownership, Prisma design, REST/WS contract and staged plan documented.
- [x] Changes isolated on chatgpt/feature-architecture; no direct main writes.
- [ ] Owner approves architecture and authorizes stage 2.
- [ ] Owner enables and verifies main branch protection/ruleset in GitHub Settings.
- [ ] Stage 2 implementation builds and tests (not applicable at documentation-only stage 1).

### Reference documentation

- Tiptap + Yjs collaboration: https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing
- Hocuspocus authentication: https://tiptap.dev/docs/hocuspocus/server/hooks
- Hocuspocus binary persistence: https://tiptap.dev/docs/hocuspocus/guides/persistence
- React Flow accessibility: https://reactflow.dev/learn/advanced-use/accessibility
- Prisma schema reference: https://www.prisma.io/docs/orm/reference/prisma-schema-reference
