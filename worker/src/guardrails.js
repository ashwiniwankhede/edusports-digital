import { BLOCK_RULES, REDACT_RULES, SAFEGUARDING_RULES } from "./guardrails.config.js";
import { callJSON } from "./llm.js";

const compiled = BLOCK_RULES.map((r) => ({ ...r, re: new RegExp(r.pattern, "i") }));
const redactors = REDACT_RULES.map((r) => ({ ...r, re: new RegExp(r.pattern, "g") }));

/** Remove personal data (emails, phone numbers) from free text. */
export function redact(text) {
  let out = String(text ?? "");
  for (const r of redactors) out = out.replace(r.re, r.replace);
  return out;
}

/** Deep-redact every string in an object. */
export function redactDeep(v) {
  if (typeof v === "string") return redact(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)]));
  return v;
}

/** Layer 1: rule filter. Returns the first matching rule or null. */
export function ruleCheck(text) {
  const t = String(text ?? "");
  for (const r of compiled) if (r.re.test(t)) return { id: r.id, message: r.message, layer: "rules" };
  return null;
}

/** Layer 2: AI classifier. Fails open only if the classifier itself errors (logged). */
export async function aiCheck(env, text) {
  if (env.GUARDRAIL_LLM_CHECK !== "true") return null;
  const system = [
    "You are a child-safeguarding reviewer for a PE lesson-planning tool used by schools (children aged 3–12).",
    "Decide whether the teacher's request is safe to fulfil under this policy:",
    ...SAFEGUARDING_RULES.map((r, i) => `${i + 1}. ${r}`),
    "Ordinary PE content (games, skills, fitness, spotting in gymnastics, inclusive grouping, safety rules) is SAFE.",
    "Off-topic but harmless requests are SAFE. Only mark UNSAFE if the request seeks content that breaches the policy.",
  ].join("\n");
  const schema = {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["SAFE", "UNSAFE"] },
      category: { type: "string", description: "short label, e.g. sexual_content, grooming, abuse, punishment, other" },
      reason: { type: "string", description: "one short sentence for the teacher" },
    },
    required: ["verdict", "category", "reason"],
  };
  const res = await callJSON(env, {
    model: env.SAFETY_MODEL || env.MODEL,
    system,
    user: `Teacher request:\n"""\n${String(text).slice(0, 6000)}\n"""`,
    // Room for thinking (on by default) so the verdict is never cut off; low effort keeps it quick.
    schema, maxTokens: 1024, effort: "low",
  });
  if (res.verdict === "UNSAFE") return { id: res.category || "ai_flagged", message: res.reason || "This request conflicts with the child-safety policy.", layer: "ai" };
  return null;
}

/** Run input guardrails: rules first (free), then AI classifier. */
export async function checkInput(env, text) {
  const hit = ruleCheck(text);
  if (hit) return hit;
  try { return await aiCheck(env, text); }
  catch (e) { console.error(`safety classifier failed: ${e.message}`, e.stack); return null; }
}

/** Output guardrail: block unsafe text, and guarantee a safeguarding section exists. */
// Safety text in a good plan often *names* what is forbidden ("never use laps as
// punishment"). Drop negated sentences before scanning output so those don't trip the filter.
const NEGATION = /\b(never|not|no|avoid|don'?t|do\s+not|must\s+not|prohibit\w*|forbid\w*|without)\b/i;
export function affirmativeText(obj) {
  return Object.values(flatten(obj)).join("\n")
    .split(/(?<=[.;!?])\s+|\n/)
    .filter((s) => !NEGATION.test(s))
    .join("\n");
}
function flatten(v, out = {}, k = "") {
  if (typeof v === "string") out[k] = v;
  else if (Array.isArray(v)) v.forEach((x, i) => flatten(x, out, `${k}.${i}`));
  else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) flatten(x, out, `${k}.${kk}`);
  return out;
}

export function checkOutput(lesson) {
  const hit = ruleCheck(affirmativeText(lesson));
  if (hit) return { blocked: hit };
  if (!Array.isArray(lesson.safety_and_safeguarding) || lesson.safety_and_safeguarding.length === 0) {
    lesson.safety_and_safeguarding = [
      "Check the space and equipment for hazards before the lesson.",
      "Keep every student within the teacher's line of sight at all times.",
      "Any physical support is minimal, explained first, and given in full view of the group.",
    ];
  }
  return { lesson };
}

export { SAFEGUARDING_RULES };
