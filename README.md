# Script Collab Studio

A collaborative workspace for screenplay writing, visual storyboarding and scene-linked media.

> **Project state: architecture / Stage 1 (proposal).** The repository does not yet include a runnable application. Please do not treat the documented commands as implemented until the corresponding stage is merged.

## Vision

- Screenplay editor with scenes, dialogue, action and parentheticals.
- Scene/Shot storyboard graph with typed links, branches and sequence checks.
- Image/audio library linked to scenes and nodes.
- Explicit opt-in AI shot breakdown and storyboard suggestions.
- Real-time collaborative screenplay editing with Yjs, presence and anchored comments.

**Canonical scene identity:** screenplay scenes, graph nodes, attached media and comments all reference stable Scene IDs.

## Architecture

The authoritative design document is [docs/architecture.md](docs/architecture.md). It contains:
- Monorepo and deployment plan (React 19 + Vite 7, Fastify, PostgreSQL/Prisma, Tiptap/Yjs/Hocuspocus, React Flow, MinIO/S3).
- Entity-relationship model and proposed Prisma schema.
- REST/WS endpoint contracts and role-based authorization.
- CRDT persistence, ordering, media uploads, AI job handling, security and milestones.

## Planned repository layout

```text
apps/
  web/              # React SPA
  api/              # Fastify + Hocuspocus
packages/
  shared/           # Shared DTOs, Zod types
docs/
  architecture.md   # Stage 1 design
docker-compose.yml  # Added in implementation stages
```

## Stages and workflow

1. **Architecture — documentation PR awaiting approval.**
2. Backend skeleton, PostgreSQL/Prisma and authenticated CRUD.
3. Frontend skeleton, routing and authentication.
4. Tiptap/Yjs screenplay collaboration.
5. React Flow storyboard nodes and typed edges.
6. S3/MinIO media and scene/node context.
7. AI provider interface and structured shot breakdown.
8. Quality pass, accessibility, documentation and one-command Docker launch.

All implementation changes must be made in `chatgpt/feature-*` branches and reviewed by PR; never push directly to `main`. No auto-merge. Leave `.github/workflows` and secrets untouched without explicit consent.

## Running locally

**Not available yet.** Stage 2 will introduce workspace scripts and backend startup; the full `docker compose up --build` experience is an acceptance criterion of stage 8. A real build/test check is **not applicable** to this documentation-only Stage 1 PR.

## License

MIT — see [LICENSE](LICENSE).
