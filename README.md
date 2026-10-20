# PSPE Planner

No-login IB PYP PSPE planning tool: **Unit Plan Builder → AI Lesson Plan Builder → watermarked print/PDF**, with anonymous usage analytics, child-safety guardrails and a document knowledge base (RAG).

| Layer | Where it runs | What it does |
|---|---|---|
| Website (`/docs`) | **GitHub Pages** on your domain | All UI. Plans are saved in the teacher's browser (no accounts). |
| API (`/worker`) | **Cloudflare Worker** (free tier is enough for pilots) | Holds the AI key, runs guardrails, RAG and analytics. |
| Analytics + chunk store | Cloudflare **D1** (SQLite) | Events: visits, unit inputs, lesson prompts, blocks. |
| Vector index | Cloudflare **Vectorize** + **Workers AI** embeddings | Semantic search over your uploaded documents. |
| LLM | Claude API (default) or OpenAI | Switch with `LLM_PROVIDER` in `wrangler.toml`. |

GitHub Pages only serves static files, so the AI key, analytics database and RAG index have to live somewhere private — the Worker is that place. The site works on its own in **demo mode** (template lesson plans) until you connect it.

```
docs/                     ← GitHub Pages root
  index.html              planner (3 tabs: Unit Plan · AI Lesson Plan · My Plans)
  admin.html              analytics dashboard + knowledge-base upload (token-protected)
  js/config.js            ★ API URL, company name, watermark, footer
  js/ib-data.js           ATL, Learner Profile, key concepts, strands, contexts
  js/render.js            unit/lesson document layout (screen + print)
  css/print.css           A4 print, repeating header/footer + watermark
  assets/watermark.svg    ★ replace with your logo
worker/
  src/prompts.js          ★ YOUR INTELLIGENCE LAYER: pedagogy + lesson structure
  src/guardrails.config.js★ child-safety rules, redaction, policy text
  src/guardrails.js       3-layer safety engine
  src/rag.js              chunk → embed → retrieve
  src/analytics.js        events, rate limits, stats
  src/index.js            API routes
  schema.sql              D1 tables
  test/                   guardrail tests (run in CI before every deploy)
```
★ = files you're expected to edit.

---

## Setup (≈30 min)

### 1. Website on GitHub Pages
1. Create a GitHub repo and push this folder to `main`.
2. **Settings → Pages → Build and deployment →** Source: *Deploy from a branch*, Branch: `main`, Folder: `/docs`.
3. Your site is live at `https://<username>.github.io/<repo>/`. Optional custom domain: Pages settings → **Custom domain** → enter e.g. `planner.sportzvillage.com`, then at your DNS provider add a **CNAME** record `planner → <username>.github.io`. Tick **Enforce HTTPS** once the certificate is issued, and add the new origin to `ALLOWED_ORIGINS`.
4. Replace `docs/assets/watermark.svg` with your logo and edit `docs/js/config.js` (company name, footer).

The site is now live in demo mode.

### 2. API on Cloudflare
Needs Node 18+ and a free Cloudflare account.
```bash
cd worker
npm install
npx wrangler login

npx wrangler d1 create pspe-planner            # copy the database_id it prints into wrangler.toml
npm run db:init                                 # creates tables
npx wrangler vectorize create pspe-kb --dimensions=768 --metric=cosine

npx wrangler secret put ANTHROPIC_API_KEY       # or OPENAI_API_KEY + set LLM_PROVIDER="openai"
npx wrangler secret put ADMIN_TOKEN             # long random string — the admin page password
npx wrangler secret put IP_SALT                 # any random string

# set ALLOWED_ORIGINS in wrangler.toml to your site, e.g. https://planner.sportzvillage.com
npm run deploy                                  # prints https://pspe-planner-api.<you>.workers.dev
```

### 3. Connect them
Set `API_BASE` in `docs/js/config.js` to the worker URL, commit, push. The demo banner disappears and generation goes through AI.

**Optional auto-deploy:** add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; `.github/workflows/deploy-worker.yml` then tests and redeploys the worker on every push that touches `/worker`.

---

## Features

**Unit Plan Builder** — weeks, classes/week, minutes/class, boys/girls (ratio shown), grade, phase, strands, key concepts, central idea, lines of inquiry, ATL (5 categories with sub-skills), Learner Profile, learning outcomes, formative/summative assessment. *Build unit plan* creates a week × class sequence using an inquiry arc (rules, instant, free); *Build + draft with AI* has the model write each class focus. Sequence cells are editable; each row has a **Generate lesson** button.

**AI Lesson Plan Builder** — *From a unit* (pick unit → week → class; carries all unit context) or *Direct prompt*. Fixed output structure: learning intentions, success criteria, ATL/LP links, equipment, set-up, safety & safeguarding, timed phases with teaching points and support/extend differentiation, inquiry questions, assessment, sources.

**Print** — *Print / PDF* on any unit or lesson: A4, your logo header and footer on every page, diagonal watermark on every page. Choose "Save as PDF" in the print dialog; the file is named after the plan.

**My Plans** — everything saved in the browser; export/import JSON to move between devices.

## Analytics — `yoursite/admin.html`
Unlock with `ADMIN_TOKEN`. Shows unique users (period / all-time), lesson plans generated, unit plans created, AI sequences, visits, blocked requests, errors, a daily table, and the full **prompt inputs** and **unit plan inputs**. CSV export for all events, prompts, or unit inputs.

Users are anonymous: a random ID in their browser + a salted hash of their IP (used only for rate limiting). Emails and phone numbers are stripped before anything is stored or sent to the AI.

## Child-safety guardrails
Every AI request passes three layers:
1. **Rule filter** (`guardrails.config.js`) on the input *and* the AI output — sexual content, secrecy/private contact, isolating a child, inappropriate contact or imagery, physical punishment or exercise-as-punishment. Negated safety statements in output ("never use laps as punishment") don't trigger it.
2. **AI classifier** — a second, cheap model call judges the request against the written policy (`GUARDRAIL_LLM_CHECK="true"`); it catches what patterns can't.
3. **Policy in the system prompt** — the generator must follow `SAFEGUARDING_RULES`, and every lesson ships with a safeguarding section (a default is inserted if missing).

Blocked requests return a clear message to the teacher and are logged under *Blocked by guardrails* for review. Unit inputs sent to analytics are rule-checked too. To extend: add a rule object or a policy line in `guardrails.config.js`, add a case to `test/guardrails.test.js`, push.

Also built in for a public no-login site: per-visitor hourly limit and a site-wide daily cap (`RATE_LIMIT_PER_HOUR`, `DAILY_GENERATION_CAP`), and CORS locked to your domain.

## Knowledge base (RAG)
`admin.html → Knowledge base`: upload PDFs, TXT or Markdown (or paste text). Text is extracted in the browser, chunked (~1,200 chars, 200 overlap), embedded with Workers AI and indexed. At generation time the top matches (`RAG_TOP_K`, above `RAG_MIN_SCORE`) are passed to the model inside `<knowledge>` tags, and the source names are listed on the lesson. Re-uploading a file with the same name replaces it. Scanned PDFs need OCR first.

Good first documents: your licensed PSPE scope & sequence, school safeguarding policy, Sportz Village lesson library and equipment guides. *IB framework documents are copyrighted — only upload what your schools are licensed to use.*

## Adding your intelligence (stage 2)
Everything that shapes output is in `worker/src/prompts.js`:
- `PEDAGOGY` — replace the generic IB guidance with the Sportz Village methodology.
- `LESSON_SCHEMA` — add/rename sections (e.g. *Sportz Village activity code*, *video link*, *curriculum mapping*). Add the matching block in `docs/js/render.js` so it shows and prints.
- `lessonPrompt` / `sequencePrompt` — change how unit context, class position and knowledge are framed.
- `docs/js/demo.js → stageFor()` — the rule-based unit arc.

## Costs & limits
Cloudflare Workers, D1, Vectorize and Workers AI all have free tiers that comfortably cover a pilot; check current Cloudflare pricing before scale. AI cost is per generation (one lesson ≈ one large-model call + one small safety call). Rate limits above cap your exposure.

## Local development
```bash
cd worker && cp .dev.vars.example .dev.vars && npm run dev   # API on http://localhost:8787 (Vectorize/AI use remote bindings)
cd docs && npx serve -l 8080                                    # site on http://localhost:8080 — set API_BASE to http://localhost:8787
cd worker && npm test                                           # guardrail tests
```
