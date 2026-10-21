// Provider-agnostic "give me JSON matching this schema" call.
// Anthropic: structured outputs (output_config.format) — the response text is
// guaranteed to match the schema. Forced tool_choice is rejected by current
// models (Sonnet 5.5, Opus 5.5), so don't go back to it.
// OpenAI: JSON mode with the schema in the system prompt.

export async function callJSON(env, { model, system, user, schema, maxTokens = 4000, effort }) {
  const provider = (env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (provider === "openai") return openai(env, { model, system, user, schema, maxTokens });
  return anthropic(env, { model, system, user, schema, maxTokens, effort });
}

// Models that accept server-side refusal fallback ("default" routing, Claude API only).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

/** Structured outputs require additionalProperties:false on every object. */
export function strictSchema(s) {
  if (Array.isArray(s)) return s.map(strictSchema);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = k === "properties" ? Object.fromEntries(Object.entries(v).map(([p, ps]) => [p, strictSchema(ps)])) : strictSchema(v);
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

export function anthropicRequest(env, { model, system, user, schema, maxTokens, effort }) {
  const m = model || env.MODEL;
  const headers = { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" };
  const body = {
    model: m,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: strictSchema(schema) }, ...(effort ? { effort } : {}) },
  };
  if (FALLBACK_MODELS.has(m)) { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
  return { headers, body };
}

export function parseAnthropic(data) {
  if (data.stop_reason === "refusal") throw new Error(`Model declined the request (refusal: ${data.stop_details?.category || "unspecified"})`);
  if (data.stop_reason === "max_tokens") throw new Error("Model output was cut off (max_tokens reached)");
  // Thinking blocks may come first; the JSON is in the last text block.
  const text = (data.content || []).filter((b) => b.type === "text").pop()?.text;
  if (!text) throw new Error(`Model returned no structured output (stop_reason: ${data.stop_reason})`);
  return JSON.parse(text);
}

async function anthropic(env, opts) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const { headers, body } = anthropicRequest(env, opts);
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${data?.error?.message || "error"}`);
  return parseAnthropic(data);
}

async function openai(env, { model, system, user, schema, maxTokens }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: model || env.MODEL,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\n\nRespond ONLY with a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${data?.error?.message || "error"}`);
  return JSON.parse(data.choices[0].message.content);
}
