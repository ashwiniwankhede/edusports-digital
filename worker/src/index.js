import { callJSON } from "./llm.js";
import { checkInput, checkOutput, ruleCheck, redactDeep } from "./guardrails.js";
import { lessonPrompt, sequencePrompt, retrievalQuery, LESSON_SCHEMA, SEQUENCE_SCHEMA } from "./prompts.js";
import { retrieve, ingestChunks, deleteSource, listSources, chunkText } from "./rag.js";
import { ipHash, logEvent, overLimit, stats, exportEvents } from "./analytics.js";

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...cors, ...extra } });

    try {
      // ───── public ─────
      if (url.pathname === "/api/health") return json({ ok: true });
      if (url.pathname.startsWith("/api/") && !cors["Access-Control-Allow-Origin"]) return json({ error: "forbidden_origin" }, 403);

      if (url.pathname === "/api/track" && request.method === "POST") {
        const body = await readJSON(request, 20000);
        if (!["visit", "unit_created"].includes(body.type)) return json({ error: "bad_type" }, 400);
        const ip = await ipHash(env, request);
        const payload = redactDeep(body.payload || {});
        const hit = body.type === "unit_created" ? ruleCheck(JSON.stringify(payload)) : null;
        ctx.waitUntil(logEvent(env, hit
          ? { type: "blocked", anonId: body.anon_id, ipHash: ip, payload: { where: "unit_inputs", rule: hit.id, inputs: payload } }
          : { type: body.type, anonId: body.anon_id, ipHash: ip, payload }));
        return json({ ok: true });
      }

      if (url.pathname === "/api/lesson" && request.method === "POST") return await handleGenerate("lesson");
      if (url.pathname === "/api/unit-sequence" && request.method === "POST") return await handleGenerate("sequence");

      // ───── admin (Bearer ADMIN_TOKEN) ─────
      if (url.pathname.startsWith("/admin/")) {
        if (!env.ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);

        if (url.pathname === "/admin/stats") return json(await stats(env, clamp(url.searchParams.get("days"), 1, 365, 30)));
        if (url.pathname === "/admin/export") {
          const csv = await exportEvents(env, url.searchParams.get("type") || "");
          return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=events.csv", ...cors } });
        }
        if (url.pathname === "/admin/sources" && request.method === "GET") return json({ sources: await listSources(env) });
        if (url.pathname === "/admin/sources" && request.method === "DELETE") {
          const source = url.searchParams.get("source");
          return json({ deleted: await deleteSource(env, source) });
        }
        if (url.pathname === "/admin/ingest" && request.method === "POST") {
          const body = await readJSON(request, 5_000_000);
          const source = String(body.source || "").trim().slice(0, 200);
          if (!source) return json({ error: "source required" }, 400);
          if (body.replace) await deleteSource(env, source);
          const chunks = Array.isArray(body.chunks)
            ? body.chunks.map((c) => ({ index: Number(c.index), text: String(c.text || "") }))
            : chunkText(body.text || "").map((text, index) => ({ index, text }));
          return json({ source, ingested: await ingestChunks(env, source, chunks) });
        }
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(`${url.pathname} failed: ${err.message}`, err.stack); // message first so Observability shows it
      if (err.status) return json({ error: "bad_request", message: err.message }, err.status);
      ctx.waitUntil(logEvent(env, { type: "error", payload: { path: url.pathname, message: String(err.message).slice(0, 500) } }).catch(() => {}));
      return json({ error: "server_error", message: "Something went wrong generating the plan. Please try again." }, 500);
    }

    // ───── AI generation with guardrails, RAG and analytics ─────
    async function handleGenerate(kind) {
      const started = Date.now();
      const anonId = request.headers.get("x-anon-id") || "";
      const ip = await ipHash(env, request);
      const body = await readJSON(request, 60000);
      const req = redactDeep(kind === "lesson" ? validateLesson(body) : { unit: validateUnit(body.unit) });

      const limited = await overLimit(env, ip);
      if (limited) return json({ error: "rate_limited", message: limited }, 429);

      // Layer 1 + 2 input guardrails
      const blocked = await checkInput(env, JSON.stringify(req));
      if (blocked) {
        ctx.waitUntil(logEvent(env, { type: "blocked", anonId, ipHash: ip, payload: { where: kind, layer: blocked.layer, rule: blocked.id, input: req } }));
        return json({ error: "blocked", message: blocked.message }, 422);
      }

      // RAG
      let chunks = [];
      const wantRag = kind === "sequence" || req.useRag !== false;
      if (wantRag) {
        try { chunks = await retrieve(env, kind === "lesson" ? retrievalQuery(req) : retrievalQuery({ mode: "unit", unit: req.unit })); }
        catch (e) { console.error("retrieval failed", e); }
      }

      if (kind === "sequence") {
        const { system, user } = sequencePrompt(req.unit, chunks);
        const out = await callJSON(env, { system, user, schema: SEQUENCE_SCHEMA, maxTokens: 16000 });
        const total = req.unit.weeks * req.unit.classesPerWeek;
        const sequence = (out.sequence || []).slice(0, total).map((s) => ({
          week: clamp(s.week, 1, req.unit.weeks, 1), cls: clamp(s.cls, 1, req.unit.classesPerWeek, 1),
          focus: String(s.focus || ""), outcome: String(s.outcome || ""),
        }));
        const hit = ruleCheck(JSON.stringify(sequence));
        if (hit) {
          ctx.waitUntil(logEvent(env, { type: "blocked", anonId, ipHash: ip, payload: { where: "sequence_output", rule: hit.id } }));
          return json({ error: "blocked", message: hit.message }, 422);
        }
        ctx.waitUntil(logEvent(env, { type: "sequence_generated", anonId, ipHash: ip, payload: { input: req.unit, model: env.MODEL, rag_sources: chunks.map((c) => c.source), latency_ms: Date.now() - started } }));
        return json({ sequence });
      }

      const { system, user } = lessonPrompt(req, chunks);
      // max_tokens covers thinking plus the plan (thinking is on by default on current models).
      const raw = await callJSON(env, { system, user, schema: LESSON_SCHEMA, maxTokens: 16000 });
      const checked = checkOutput(raw);
      if (checked.blocked) {
        ctx.waitUntil(logEvent(env, { type: "blocked", anonId, ipHash: ip, payload: { where: "lesson_output", rule: checked.blocked.id, input: req } }));
        return json({ error: "blocked", message: "The generated plan did not pass the safety check. Please rephrase your request." }, 422);
      }
      const lesson = checked.lesson;
      lesson.duration_min ||= req.minutes;
      if (req.mode === "unit") { lesson.unit_title ||= req.unit.title; lesson.grade ||= req.unit.grade; }
      lesson.sources = [...new Map(chunks.map((c) => [c.source, { source: c.source, score: Number(c.score.toFixed(3)) }])).values()];

      ctx.waitUntil(logEvent(env, { type: "lesson_generated", anonId, ipHash: ip, payload: {
        mode: req.mode, input: req.mode === "unit" ? { ...req, unit: { title: req.unit.title, grade: req.unit.grade } } : req,
        title: lesson.title, model: env.MODEL, rag_sources: lesson.sources.map((s) => s.source), latency_ms: Date.now() - started,
      } }));
      return json({ lesson });
    }
  },
};

// ───── helpers ─────
function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes("*") || allowed.includes(origin);
  return ok ? {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Anon-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  } : {};
}

async function readJSON(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) throw httpError(413, "Request too large");
  try { return JSON.parse(text || "{}"); } catch { throw httpError(400, "Invalid JSON"); }
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function clamp(v, lo, hi, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }
const str = (v, max = 300) => String(v ?? "").slice(0, max);
const arr = (v, maxItems = 20, max = 300) => (Array.isArray(v) ? v.slice(0, maxItems).map((x) => str(x, max)) : []);

function validateUnit(u = {}) {
  if (!u || typeof u !== "object") throw httpError(400, "unit required");
  return {
    title: str(u.title, 150), context: str(u.context, 100), grade: str(u.grade, 30), phase: str(u.phase, 30),
    strands: arr(u.strands, 3, 40), keyConcepts: arr(u.keyConcepts, 7, 40),
    centralIdea: str(u.centralIdea, 500), linesOfInquiry: arr(u.linesOfInquiry, 6, 300),
    weeks: clamp(u.weeks, 1, 20, 6), classesPerWeek: clamp(u.classesPerWeek, 1, 7, 2), minutesPerClass: clamp(u.minutesPerClass, 15, 120, 40),
    boys: clamp(u.boys, 0, 60, 0), girls: clamp(u.girls, 0, 60, 0), facilities: str(u.facilities, 400),
    atl: arr(u.atl, 25, 120), lp: arr(u.lp, 10, 40), outcomes: arr(u.outcomes, 20, 400),
    formative: str(u.formative, 500), summative: str(u.summative, 500),
  };
}

function validateLesson(b = {}) {
  const common = { extra: str(b.extra, 500), useRag: b.useRag !== false };
  if (b.mode === "unit") {
    const unit = validateUnit(b.unit);
    return { mode: "unit", unit, week: clamp(b.week, 1, unit.weeks, 1), cls: clamp(b.cls, 1, unit.classesPerWeek, 1),
      focus: str(b.focus, 300), outcome: str(b.outcome, 400), minutes: unit.minutesPerClass, ...common };
  }
  const prompt = str(b.prompt, 2000).trim();
  if (prompt.length < 10) throw httpError(400, "Please describe the lesson you want.");
  return { mode: "prompt", prompt, grade: str(b.grade, 30), minutes: clamp(b.minutes, 15, 120, 40),
    boys: clamp(b.boys, 0, 60, 0), girls: clamp(b.girls, 0, 60, 0), ...common };
}
