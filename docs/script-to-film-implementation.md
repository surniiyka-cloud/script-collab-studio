# Script-to-Film — Stage 5 acceptance

**State: feature PR draft. Backend/frontend build, database smoke and browser workflows have not yet been executed in Codespaces. Not production-ready.**

## Implemented in this branch

- Complete screenplay import: TXT, Fountain, Markdown, DOCX (Mammoth) and selectable-text PDF (PDF.js). Text is extracted in the browser; there is no OCR. Limit 400,000 characters and 150 scenes. Preview and explicit confirmation required.
- Deterministic, reviewable scene/headings/dialogue parsing; imported original lines are preserved in Yjs screenplay XML fragments. Import never calls a generative model and never silently changes lines.
- Found character names become CHARACTER graph nodes; users can add names and upload reference JPEG/PNG/WebP associated with that specific character. Named references reside in private S3-compatible SeaweedFS S3 storage and remain project-permission protected.
- Scene-to-shot suggestions extracted from source text; optional *local* Ollama text model creates alternative plans only on request. Approval creates SHOT graph nodes with timing, sound and music cue notes. No automatic alteration of screenplay source.
- Approved SHOT nodes support attached visual and audio (MP3/WAV) files.
- Animatic timeline previews real attached stills and audio, controls play/pause and shot selection, durations and original captions.
- Optional local FFmpeg MP4 export of approved still shots (1280x720, H.264/AAC; 25 shots or 150 seconds maximum). Export requires one image per shot, configured SeaweedFS S3 and locally installed FFmpeg.
- No fake image/video/music generation or implied access to ChatGPT's image generation API; visual generative providers are still to come. Audio/music cue descriptions are not generated sounds.

## Test in Codespaces (this branch is stacked on PR #4, itself stacked on PR #3)

Run in a clean worktree (protect existing pnpm-lock.yaml changes before switching):

    git fetch origin
    git switch --track origin/chatgpt/feature-script-to-film-pipeline
    pnpm install --no-frozen-lockfile
    pnpm build
    pnpm test:logic
    bash scripts/verify-production.sh

The integration script starts local PostgreSQL/SeaweedFS, checks source import and Yjs persistence, approved shots/timeline, character detection and a stored/retrieved reference image. It does not test PDF/DOCX, local Ollama or FFmpeg.

To use the website manually:

    docker compose up -d postgres objectstore

For existing ignored apps/api/.env, add ONLY missing lines for local SeaweedFS S3:

    S3_ENDPOINT=http://127.0.0.1:9000
    S3_ACCESS_KEY=localstudio
    S3_SECRET_KEY=localstudio_dev_only
    S3_BUCKET=studio-media

Then:

    pnpm dev

Open forwarded port 5173. The project now has a "Производство" tab: 01 Сценарий → 02 Персонажи → 03 Покадровка → 04 Предпросмотр.

Manual checks:
1. Import a two-scene test screenplay with dialogue. Review preview, confirm, switch to Сценарий and check unchanged dialogue/scene boundaries.
2. Assign a character reference image; refresh and confirm stored image loads for the correct person.
3. Generate and edit suggestions for a scene, approve, attach a still image and optional audio.
4. Play the animatic in Предпросмотр. For full MP4, attach one image per shot and install FFmpeg in Codespaces. Test a downloaded MP4 externally.
5. Optional local text AI: install Ollama/model and configure OLLAMA_URL=http://127.0.0.1:11434 and OLLAMA_MODEL. With no model configured the UI must show a service error, not pretend to generate.

**Important:** OCR for scanned PDFs, AI image/video/audio generation, voice synthesis, long-form rendering queues, identity consistency by reference and multimedia timeline editing are NOT implemented in this slice. They need separately configured engines, computing resources, user-controlled approvals and licensing. Future adapters: ComfyUI/Wan image/video, ACE-Step music, consented TTS. See docs/ai-roadmap.md.

Remaining gates: Codespaces install/build, typed API compile, integration tests, PDF/DOCX review on a representative script, UI browser smoke, FFmpeg playback, generated pnpm lockfile commit, repository review. Keep PR draft until these pass. Merge PR #3 → PR #4 → PR #5 in order. No secrets or CI workflow modifications.

Security: media is project-scoped; local SeaweedFS S3 credentials are demo-only; remove public-access assumptions before deployment. Storage object garbage collection on project deletion is a later task. Existing JWTs are 15-minute development bearer sessions; production needs token hardening and quotas.

## October 2026 Docker image compatibility

`minio/minio:latest` is no longer publicly downloadable. The local Compose service was migrated to `objectstore` using the official `chrislusf/seaweedfs:latest` image, providing an authenticated S3-compatible endpoint on the same host URL `http://127.0.0.1:9000` (internal container port 8333). The existing S3 SDK, project-level media permissions, and demo credentials are unchanged. No third-party MinIO mirrors are needed. For production, review the storage engine, credentials, version pinning, backups and licensing separately.
