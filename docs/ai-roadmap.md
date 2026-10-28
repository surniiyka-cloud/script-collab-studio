# AI integrations roadmap — optional open-source-first creative tools

**Status: architecture planning only. No AI provider is connected or charged by the app at Stage 4.**

Creative goal: users can optionally generate and attach *drafts* to projects/scenes: outlines and dialogue (text), scene references (images), short animatics (video), background scores and SFX (audio). Human authors explicitly choose and accept any AI output. An AI response never silently overwrites a Yjs screenplay document.

## Provider strategy

| Task | Suggested self-hosted/open provider | Caveats |
|---|---|---|
| Text: ideas, scene breakdown, dialogue variants, consistency | Ollama local REST `/api/chat` and supported open-weight model | Local inference avoids per-request vendor charges, but requires adequate computer resources and model-license review |
| Images: characters, locations, shot concepts | ComfyUI local queue/workflow API (SDXL, FLUX-family or other compatible checkpoint) | Check each checkpoint's commercial-use license; GPU/RAM required; some ComfyUI partner nodes are paid |
| Video: image-to-video, text-to-video animatics | ComfyUI video pipeline (e.g. Wan 2.2 or other eligible weights) | Often significant GPU resources and storage; **do not promise free cloud GPU** |
| Music and ambience | ACE-Step 1.5 via local self-host or ComfyUI-compatible workflow | MIT project; review the exact weights/license and audio usage rights before commercial use |

Links:
- Ollama: https://github.com/ollama/ollama and https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx
- ComfyUI: https://github.com/Comfy-Org/ComfyUI
- Wan 2.2: https://github.com/Wan-Video/Wan2.2
- ACE-Step 1.5: https://github.com/ace-step/ACE-Step-1.5

MusicGen/AudioCraft is an alternative for **noncommercial** experimentation: although AudioCraft code is MIT, MusicGen model *weights* use CC-BY-NC 4.0. It is not a safe default for monetized video soundtracks.

## Integration principles (later implementation)

1. **Secrets and permissions:** model endpoints and any paid API credentials exist server-side only (never in a public web bundle). Project roles and quotas checked on every job, including asset download. Never run arbitrary user-supplied ComfyUI node graphs directly.
2. **Provider adapters:** server-only `TextProvider`, `ImageProvider`, `VideoProvider`, `AudioProvider` interfaces; capability checks; asynchronous job states; cancellation and rate/CPU/GPU quotas. Keep a stable `AIJob` record with prompt and output provenance.
3. **Job API:** create `POST /api/v1/projects/:id/ai-jobs` with a known operation, poll progress, cancel; store prompt and status. Return an explicit 'provider not configured' error when no local endpoint is connected, never show fabricated result.
4. **Media:** write actual generated outputs to private MinIO/S3 via server, create `MediaAsset` and attach to real Scene/Node; manage usage rights and model metadata.
5. **Safety and cost:** explicit confirmation of remote requests, clear cost/VRAM warnings, model licenses, prompts privacy, and opt-in retention.
6. **Creative UX:** prompt templates 'Продолжить диалог', 'Раскадровка сцены', 'Образ персонажа', 'Превратить кадр в клип', 'Музыкальная тема'; generation panel with drafts and accept/reject actions.

ChatGPT's built-in image generator **is not an API credential** that can be transferred from this conversation into a custom app. A separate, supported API or local image engine is required. No guaranteed unlimited free public image/video generation is assumed.

**Order:** complete Stage 3 UI checks → Stage 4 screenplay Yjs editor → Stage 5 interactive plot/storyboard graph → Stage 6 media upload/library → Stage 7 optional AI adapters and provider setup.
