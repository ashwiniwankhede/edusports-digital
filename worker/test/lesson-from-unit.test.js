import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { lessonPrompt, applyPlan } from "../src/prompts.js";

const unit = {
  title: "Moving bodies, healthy me", unitNo: "3", grade: "Grade 1", context: "Body management / gymnastics", theme: "Who we are",
  centralIdea: "Our bodies grow and change", linesOfInquiry: ["How our bodies move"], keyConcepts: ["Form", "Causation"],
  atl: ["Social skills: Collaboration", "Self-management skills: Gross motor skills"], lp: ["Balanced", "Caring"],
  outcomes: ["Balance with control", "Travel and stop safely"], weeks: 2, classesPerWeek: 2, minutesPerClass: 40,
  ratLearning: "Body awareness and control", ratWhyPE: "Students feel balance in their own bodies", ratBehaviours: "Safe risk-taking",
};
const plan = { code: "G1-U3-L02", name: "Big and small balances", los: ["LO1"], keyConcept: "Causation", lp: "Caring", atl: "Social skills: Collaboration", assessment: "Formative: peer feedback" };
const req = { mode: "unit", unit, week: 1, cls: 2, focus: "Balance on different bases", outcome: "Hold big and small balances on 3 points",
  plan, prev: "Tuning in — what can my body do", next: "Travelling with control" };

test("lesson prompt carries the whole timeline column, rationale and neighbours", () => {
  const { user } = lessonPrompt(req, []);
  for (const s of ["G1-U3-L02 — Big and small balances", "(LO1): Hold big and small balances on 3 points", "key concept: Causation",
    "Learner Profile attribute: Caring", "ATL skill: Social skills: Collaboration", "Planned assessment: Formative: peer feedback",
    "Previous lesson: Tuning in", "Next lesson: Travelling with control", "Unit rationale: main learning — Body awareness and control"]) {
    assert.ok(user.includes(s), `missing: ${s}`);
  }
  assert.ok(!user.includes("Pick 1–2"), "planned choices replace the free pick");
});

test("blank planned fields fall back to choosing from the unit", () => {
  const { user } = lessonPrompt({ ...req, plan: { ...plan, lp: "", atl: "" } }, []);
  assert.ok(user.includes("Pick 1–2 of the unit's ATL skills and 1–2 of its Learner Profile attributes"));
});

test("generated lesson takes the timeline's name, code and planned choices", () => {
  const lesson = applyPlan({ title: "Model title", key_concepts: ["Form", "causation"], learner_profile: ["Balanced"] }, plan);
  assert.equal(lesson.title, "Big and small balances");
  assert.equal(lesson.lesson_code, "G1-U3-L02");
  assert.deepEqual(lesson.key_concepts, ["Causation", "Form"], "planned first, no duplicate");
  assert.deepEqual(lesson.learner_profile, ["Caring", "Balanced"]);
  assert.deepEqual(lesson.atl, ["Social skills: Collaboration"]);
});

test("/api/lesson end to end: plan applied, prompt includes it", async () => {
  let prompt = "";
  globalThis.fetch = async (_u, init) => {
    const body = JSON.parse(init.body);
    const out = body.model === "claude-haiku-5-5" ? { verdict: "SAFE", category: "none", reason: "" }
      : (prompt = body.messages[0].content, { title: "Model title", grade: "Grade 1", duration_min: 40, focus: "f", learning_intentions: ["x"], success_criteria: ["y"],
        atl: ["Thinking skills: Reflection"], learner_profile: ["Balanced"], key_concepts: ["Form"], equipment: [], space_setup: "s",
        safety_and_safeguarding: ["Check the space"], phases: [], inquiry_questions: [], assessment: { strategy: "s", evidence: "e" } });
    return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(out) }] }) };
  };
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ n: 0 }), run: async () => {}, all: async () => ({ results: [] }) }) }) };
  const env = { ALLOWED_ORIGINS: "https://site", MODEL: "claude-sonnet-5-5", SAFETY_MODEL: "claude-haiku-5-5", GUARDRAIL_LLM_CHECK: "true", ANTHROPIC_API_KEY: "k", DB };
  const res = await worker.fetch(new Request("https://w/api/lesson", { method: "POST", headers: { origin: "https://site", "content-type": "application/json" },
    body: JSON.stringify({ ...req, useRag: false }) }), env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  const { lesson } = await res.json();
  assert.equal(lesson.title, "Big and small balances");
  assert.equal(lesson.lesson_code, "G1-U3-L02");
  assert.equal(lesson.atl[0], "Social skills: Collaboration");
  assert.ok(prompt.includes("Planned assessment: Formative: peer feedback"));
});
