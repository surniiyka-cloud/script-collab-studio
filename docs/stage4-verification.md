# Stage 4: screenplay Tiptap + Yjs collaboration — draft verification

Branch `chatgpt/feature-screenplay-editor` is stacked on unmerged Stage 3 branch `chatgpt/feature-frontend-shell`. **Neither is merged into main**.

## Included in code
- A per-scene Tiptap editor with six persisted screenplay block kinds: scene heading, action, character, dialogue, parenthetical, transition.
- Bold/italic formatting, keyboard shortcuts Ctrl/⌘ + Alt + 1..6 for screenplay block styles.
- Open-source Tiptap 3 / Yjs 13 / Hocuspocus provider React 4.7.1; awareness-based collaborator cursors.
- Browser-origin `/collab` Vite WebSocket proxy to backend 3002. This works through HTTPS Codespaces browser forwarding without directly exposing port 3002 as a public service.
- On reconnect, changes come from the Yjs XML fragment `screenplay` inside `scene:<uuid>` document and are persisted by Hocuspocus to PostgreSQL `YDocState`.
- Read-only UI for Viewer role; edit controls enable only if provider authenticated as `read-write` and synced.
- No duplication of screenplay text into Scene.synopsis (a separately editable description).
- No fabricated AI output; provider selection planning at [AI roadmap](ai-roadmap.md).

## What requires real Codespaces verification

1. `git fetch origin && git switch --track origin/chatgpt/feature-screenplay-editor`
2. `pnpm install --no-frozen-lockfile && pnpm --filter @studio/web build`
3. If dependencies fail to resolve or TypeScript reports an error, share terminal output; the PR stays draft.
4. Run `docker compose up -d postgres && pnpm dev`, visit port 5173 in Codespaces via **Ports → Open in Browser**.
5. Sign in; create/open project, screenplay and scene; type headings, action and dialogue; refresh and confirm text survives.
6. Open two authenticated tabs into the same scene; type in tab A and check tab B updates. Confirm two different usernames display colored carets when available.
7. Test metadata Save independently from live screenplay edits: scene title/synopsis require Save; screenplay text syncs automatically.
8. With a Viewer member, confirm editor and formatting are disabled while text is visible; backend already enforces read-only writes on WebSocket.
9. Inspect Network → WS if text stalls; proxy URL should be `wss://<codespace-forwarded-5173-host>/collab`.
10. Stage fresh install adds `pnpm-lock.yaml` changes. Review and commit only the lockfile if it matches pinned dependencies; do not commit `.env` or secrets.

## Limitations
- Tiptap rich text is a separate Y.XmlFragment, not the Y.Text used by the backend's isolated HTTP/WS smoke fixture. Test fixtures use disposable scenes; old persistent documents manually populated using Y.Text under the same key need migration before editing.
- Initial dependency installation, build, browser verification and cold-restart persistence checks have not been run in this assistant environment.
- JWTs expire in 15 minutes. Re-auth is manual; refresh token rotation and live revocation of existing sockets remain future hardening.
- A disconnected editor is set read-only to avoid implying that changes are durably stored while offline. Offline-first queued persistence is not implemented.
- Viewer policy is enforced on server; browser toolbar locking alone is not an authorization boundary.
- Does not include graph editing, media storage, AI execution, sharing invites or production deployment.

## Build check
```bash
pnpm install --no-frozen-lockfile
pnpm --filter @studio/web build
pnpm --filter @studio/api build
```

Document all checks honestly; Stage 4 PR remains **draft** until Codespaces has executed its build and browser collaboration test.
