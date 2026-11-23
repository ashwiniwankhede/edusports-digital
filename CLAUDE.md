# EduSports Digital — notes for Claude Code

No-login IB PYP PSPE planning tool for Sportz Village / EduSports Digital.
Static site on GitHub Pages (`/docs`) + Cloudflare Worker API (`/worker`).

## Layout
- `docs/` — plain HTML/CSS/vanilla JS, no build step. Served as-is by GitHub Pages.
  - `js/config.js` — API_BASE, branding, watermark. Empty API_BASE = demo mode.
  - `js/app.js` — UI logic (tabs, unit form, lesson builder, library, print).
  - `js/render.js` — unit/lesson document HTML (shared by screen and print); lessons have a
    full plan and an abstract view.
  - `js/diagram.js` — draws space/formation diagrams (SVG) from the layout data the AI returns.
  - `js/demo.js` — rule-based unit sequence + template lesson (demo mode).
  - `js/store.js` — localStorage persistence. `js/ib-data.js` — IB lists.
  - `css/print.css` — A4 print, repeating header/footer + watermark.
  - `admin.html` — analytics dashboard + RAG upload (Bearer ADMIN_TOKEN).
  - `common.html` — common safety, safeguarding and teacher notes for every lesson; the QR code
    on each lesson plan (`assets/common-qr.svg`) points here.
- `worker/` — Cloudflare Worker (ES modules, no framework).
  - `src/index.js` — routes: /api/track, /api/lesson, /api/unit-sequence, /admin/*.
  - `src/prompts.js` — PEDAGOGY (EduSports pedagogy v1.0), LESSON_SCHEMA, lesson split, prompt builders,
    post-generation rules (`applyLessonRules`).
  - `src/ib-continuums.js` — IB PSPE continuums text (verbatim, licensed), grade→phase map, IB brief.
  - `src/guardrails.config.js` / `src/guardrails.js` — child-safety rules (3 layers).
  - `src/rag.js` — chunking, Workers AI embeddings, Vectorize, D1 chunk store.
  - `src/analytics.js` — D1 events, rate limits, stats, CSV export.
  - `src/llm.js` — Anthropic (structured outputs via `output_config.format`) / OpenAI JSON calls.
  - `schema.sql`, `wrangler.toml`, `test/` (node:test).
- `knowledge/` — text files to upload to the knowledge base (admin page); not served by the site.

## Rules
- Keep `docs/` dependency-free and build-free (GitHub Pages serves it directly).
- Lesson structure changes need BOTH `worker/src/prompts.js` (LESSON_SCHEMA) and
  `docs/js/render.js` (+ `docs/js/demo.js` template) so screen, print and AI agree.
  Diagram layout changes need `DIAGRAM_FORMAT` (prompts.js) and `docs/js/diagram.js` (parse) together.
  Keep diagrams as one text field each: nested per-phase JSON made the API's output grammar too large.
- General safety / teacher notes belong in `docs/common.html`, not in each lesson plan.
- The default lesson split lives in both `lessonSplit()` (prompts.js) and `split()` (docs/js/demo.js): keep them in step.
- Never send IB items on puberty, sexuality, substances or harassment to the model (filtered in ib-continuums.js).
- When `docs/` JS or CSS changes, bump the `?v=` tag on its links in index.html / admin.html /
  common.html so browsers fetch the new files instead of a cached copy.
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
