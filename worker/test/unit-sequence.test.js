import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { sequenceSchema, blankSections, sequencePrompt } from "../src/prompts.js";

const unit = {
  title: "Moving bodies, healthy me", unitNo: "3", grade: "Grade 1", context: "Body management / gymnastics",
  theme: "Who we are", centralIdea: "Our bodies grow and change", linesOfInquiry: ["How our bodies move"],
  keyConcepts: ["Form"], atl: ["Self-management skills: Gross motor skills"], lp: ["Balanced"],
  outcomes: ["Balance with control", "Travel and stop safely"], weeks: 1, classesPerWeek: 2, minutesPerClass: 40,
  knowledge: ["Body parts used for balance"], assessWhat: "Balance and control",
  name: "Ms Example",
};

test("only blank sections are drafted", () => {
  const blank = blankSections(unit);
  assert.ok(!blank.includes("knowledge") && !blank.includes("assessWhat"));
  assert.ok(blank.includes("skills") && blank.includes("tdConcepts") && blank.includes("ratWhyPE"));
  const schema = sequenceSchema(blank);
  assert.deepEqual(schema.properties.sections.required, blank);
  assert.equal(sequenceSchema([]).properties.sections, undefined);
});

test("prompt numbers the unit outcomes and asks for lesson-level outcomes", () => {
  const { user } = sequencePrompt(unit, [], []);
  assert.match(user, /LO1: Balance with control/);
  assert.match(user, /LO2: Travel and stop safely/);
  assert.match(user, /lesson-level learning outcome/);
});

function mockEnv(reply) {
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); sent.push(body);
    const out = body.model === "claude-haiku-5-5" ? { verdict: "SAFE", category: "none", reason: "" } : reply(body);
    return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(out) }] }) };
  };
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ n: 0 }), run: async () => {}, all: async () => ({ results: [] }) }) }) };
  const env = { ALLOWED_ORIGINS: "https://site", MODEL: "claude-sonnet-5-5", SAFETY_MODEL: "claude-haiku-5-5", GUARDRAIL_LLM_CHECK: "true", ANTHROPIC_API_KEY: "k", DB };
  return { env, sent };
}
const call = (env) => worker.fetch(new Request("https://w/api/unit-sequence", {
  method: "POST", headers: { origin: "https://site", "content-type": "application/json" }, body: JSON.stringify({ unit }),
}), env, { waitUntil: () => {} });

test("unit-sequence returns the timeline and drafts, never the teacher name", async () => {
  const { env, sent } = mockEnv(() => ({
    sequence: [
      { week: 1, cls: 1, name: "Big and small balances", focus: "Balance", los: ["LO1"], outcome: "Hold a 4-point balance for 3 seconds", keyConcept: "Form", lp: "Balanced", atl: "Gross motor skills", assessment: "Formative: observation" },
      { week: 1, cls: 2, name: "Show and reflect", focus: "Sequence", los: ["lo1", "LO2", "LO9"], outcome: "Perform a balance and travel sequence", keyConcept: "Form", lp: "Balanced", atl: "Gross motor skills", assessment: "Summative: performance" },
    ],
    sections: { skills: ["Static balances"], tdConcepts: "Who we are, LOI 1", knowledge: ["should be ignored"] },
  }));
  const res = await call(env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.sequence.length, 2);
  assert.deepEqual(data.sequence[1].los, ["LO1", "LO2"], "normalised, unknown LO dropped");
  assert.equal(data.sequence[0].outcome, "Hold a 4-point balance for 3 seconds");
  assert.deepEqual(data.sections.skills, ["Static balances"]);
  assert.equal(data.sections.knowledge, undefined, "teacher-filled section is never replaced");
  for (const b of sent) assert.ok(!JSON.stringify(b).includes("Ms Example"), "teacher name not sent to the model");
});

test("unsafe timeline output is blocked", async () => {
  const { env } = mockEnv(() => ({ sequence: [{ week: 1, cls: 1, name: "x", focus: "Laps as punishment for talking", los: [], outcome: "x", keyConcept: "x", lp: "x", atl: "x", assessment: "x" }], sections: {} }));
  const res = await call(env);
  assert.equal(res.status, 422);
});
