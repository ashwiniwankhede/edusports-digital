# PSPE Planner — notes for Claude Code

No-login IB PYP PSPE planning tool for Sportz Village / EduSports Digital.
Static site on GitHub Pages (`/docs`) + Cloudflare Worker API (`/worker`).

## Layout
- `docs/` — plain HTML/CSS/vanilla JS, no build step. Served as-is by GitHub Pages.
  - `js/config.js` — API_BASE, branding, watermark. Empty API_BASE = demo mode.
  - `js/app.js` — UI logic (tabs, unit form, lesson builder, library, print).
  - `js/render.js` — unit/lesson document HTML (shared by screen and print).
  - `js/demo.js` — rule-based unit sequence + template lesson (demo mode).
  - `js/store.js` — localStorage persistence. `js/ib-data.js` — IB lists.
  - `css/print.css` — A4 print, repeating header/footer + watermark.
  - `admin.html` — analytics dashboard + RAG upload (Bearer ADMIN_TOKEN).
- `worker/` — Cloudflare Worker (ES modules, no framework).
  - `src/index.js` — routes: /api/track, /api/lesson, /api/unit-sequence, /admin/*.
  - `src/prompts.js` — PEDAGOGY, LESSON_SCHEMA, SEQUENCE_SCHEMA, prompt builders.
  - `src/guardrails.config.js` / `src/guardrails.js` — child-safety rules (3 layers).
  - `src/rag.js` — chunking, Workers AI embeddings, Vectorize, D1 chunk store.
  - `src/analytics.js` — D1 events, rate limits, stats, CSV export.
  - `src/llm.js` — Anthropic (forced tool use) / OpenAI JSON calls.
  - `schema.sql`, `wrangler.toml`, `test/` (node:test).

## Rules
- Keep `docs/` dependency-free and build-free (GitHub Pages serves it directly).
- Lesson structure changes need BOTH `worker/src/prompts.js` (LESSON_SCHEMA) and
  `docs/js/render.js` (+ `docs/js/demo.js` template) so screen, print and AI agree.
- Never weaken child-safety guardrails. When adding a rule in `guardrails.config.js`,
  add blocked AND allowed cases to `worker/test/guardrails.test.js`.
- Never commit secrets. Keys live in `wrangler secret` (ANTHROPIC_API_KEY, ADMIN_TOKEN, IP_SALT).
- User-facing copy uses UK/International English.

## Commands
- Tests: `cd worker && npm test`
- Local API: `cd worker && npm run dev` (needs `.dev.vars`, see `.dev.vars.example`)
- Local site: `cd docs && npx serve -l 8080`
- Deploy API: `cd worker && npm run deploy`
- Site deploys automatically when `docs/` changes on `main`.
