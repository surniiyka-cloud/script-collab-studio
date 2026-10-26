# Stage 3 — React web shell / verification

## Scope implemented
- React 19 + Vite 7 + TypeScript + Tailwind CSS 4 foundation; responsive visual shell.
- Login and registration screens bound to Fastify `/api/v1/auth` endpoints.
- Route protection using `/auth/me`; session token scoped to browser `sessionStorage`.
- Projects dashboard: list, search, create, navigate using real API data; empty/loading/error states.
- Project workspace: create/select screenplay, create/select/update/delete scenes (title/synopsis).
- Read-only graph summary from `/projects/:projectId/graph`; scene nodes come from API.
- UI Russian, desktop-first and basic tablet/mobile responsiveness.

## Explicitly **not** in Stage 3
- Tiptap/Yjs screenplay rich text and collaborative cursors (Stage 4).
- Interactive React Flow graph, linking/dragging edges (Stage 5).
- Real media upload and generative AI operations (Stages 6–7).
- Public deployment, refresh tokens or full production CSP/token-revocation hardening.
- Role display by project: current endpoint returns projects without member roles. API still enforces writes.

## Installation and test (Codespaces)

**Do not run on production data.** Use the existing Codespaces PostgreSQL and local API .env (not committed).

```bash
git checkout chatgpt/feature-frontend-shell
pnpm install --no-frozen-lockfile
pnpm build
pnpm typecheck
pnpm test:logic
docker compose up -d postgres
pnpm dev
```

Vite listens on port 5173 (GitHub Codespaces Ports panel → **Open in Browser**), Fastify on port 3001. Vite proxies `/api` to `127.0.0.1:3001`; no API secrets are embedded in the frontend.

Manual smoke checklist:
1. With no session visit `/projects` → redirected to `/login`.
2. Register with a fresh test email, a password of at least 10 characters and a display name → projects dashboard.
3. Create a project, search for its name and open it.
4. Create a screenplay and a scene; update scene title/synopsis; reload and verify persisted metadata.
5. Switch to the read-only Structure view; scene node count should update.
6. Delete the test scene (after confirmation). Sign out. Confirm protected routes redirect back to login.
7. Try wrong login and show controlled error; API unavailable should not render demo/fake data.

Commit generated `pnpm-lock.yaml` **only after reviewing the diff**, in this feature branch; do not commit `apps/api/.env`, token files, or generated Prisma clients.

## Security notes
- The existing Fastify backend issues 15-minute bearer JWTs, no refresh token. Tab-scoped `sessionStorage` is **development-only**; XSS in the web origin could expose this bearer token. Future production hardening should use a robust server-mediated session strategy (HttpOnly cookie + CSRF/origin protections where applicable) and CSP.
- No editor text is stored outside Yjs; Stage 3 only edits scene metadata.
- No CI workflow or secrets were modified. Backend `main` remains untouched pending PR review.

**Status:** Initial code prepared in GitHub feature branch; installation, Vite build and real browser walkthrough await Codespaces confirmation. Do not treat an unverified frontend as shipped.
