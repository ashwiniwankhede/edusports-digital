import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { lessonPrompt, sequencePrompt, applyLessonRules, lessonSplit, PEDAGOGY } from "../src/prompts.js";
import { phaseFor, ibBrief, verifiedOutcomes, IB_PSPE } from "../src/ib-continuums.js";

const unit = {
  title: "Moving with control", unitNo: "2", grade: "Grade 1", theme: "Who we are", centralIdea: "Our bodies move in many ways",
  linesOfInquiry: ["How we move"], keyConcepts: ["Form"], atl: [], lp: [], outcomes: ["Travel with control"],
  weeks: 2, classesPerWeek: 2, minutesPerClass: 40, movementMinutes: 30, skillThemes: ["Walking, Running", "Balancing"],
  props: ["24 bean bags", "12 cones"], space: "Indoor hall 20 × 12 m", country: "Singapore", rigorous: false,
};

test("pedagogy v1.0 brief: SV persona, precedence, four domains, ES Mantra, 3-point scale", () => {
  const brief = PEDAGOGY.join("\n");
  for (const s of ["Sportz Village EduSports method", "follow this order: (1) the child-safeguarding policy", "Life skill (SEL)",
    "ES Mantra", "Proficient, Developing, Needs Development", "Never include height, weight or BMI", "Use only the props the teacher lists", "metres"]) {
    assert.ok(brief.includes(s), s);
  }
});

test("grade → phase mapping, with 'more rigorous' stepping up one phase (capped at 4)", () => {
  assert.deepEqual(["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"].map((g) => phaseFor(g)), [2, 2, 3, 3, 4]);
  assert.deepEqual(["Grade 1", "Grade 3", "Grade 5"].map((g) => phaseFor(g, true)), [3, 4, 4]);
});

test("IB brief is verbatim continuum text for the phase, without out-of-scope topics", () => {
  const b = ibBrief(3);
  assert.ok(b.includes(IB_PSPE.Movement.expectations["3"]));
  assert.ok(b.includes(IB_PSPE.Movement.outcomes["3"][0]));
  for (const p of [1, 2, 3, 4]) assert.ok(!/puberty|sexual|substance|harass/i.test(ibBrief(p)), `phase ${p}`);
});

test("only real IB outcomes survive; invented ones are dropped", () => {
  const real = IB_PSPE.Movement.outcomes["2"][3];
  assert.deepEqual(verifiedOutcomes([real.toUpperCase() + ".", "Students master cricket batting"], 2), [real]);
});

test("default split is 3/6/10/14/7 with 30 movement minutes, and always adds up", () => {
  const s = lessonSplit(40, 30);
  assert.deepEqual(s.map((p) => p.minutes), [3, 6, 10, 14, 7]);
  assert.deepEqual(s.map((p) => p.movement), [0, 6, 8, 12, 4]);
  for (const [t, m] of [[45, 35], [60, 45], [30, 20], [55, 40]]) {
    const x = lessonSplit(t, m);
    assert.equal(x.reduce((a, p) => a + p.minutes, 0), t);
    assert.equal(x.reduce((a, p) => a + p.movement, 0), m);
    x.forEach((p) => assert.ok(p.movement <= p.minutes));
  }
});

test("lesson prompt carries the setting, the split, the phase brief and rigour", () => {
  const req = { mode: "unit", unit, week: 1, cls: 2, focus: "Balance", outcome: "Hold a balance", plan: {} };
  let { user } = lessonPrompt(req, []);
  for (const s of ["Props available (use ONLY these): 24 bean bags; 12 cones", "Space: Indoor hall 20 × 12 m", "Country (for climate): Singapore",
    "Skill themes: Walking, Running, Balancing", "- Tuning in: 3 min (movement 0 min)", "- Activity 2: applied game: 14 min (movement 12 min)",
    "(Phase 2; never name the phase in the plan)", IB_PSPE.Movement.outcomes["2"][0]]) assert.ok(user.includes(s), s);
  assert.ok(!user.includes("MORE RIGOROUS"));
  ({ user } = lessonPrompt({ ...req, rigorous: true }, []));
  assert.ok(user.includes("MORE RIGOROUS") && user.includes("(Phase 3;"));
  ({ user } = lessonPrompt({ mode: "prompt", prompt: "Throwing at targets", grade: "Grade 4", minutes: 45, movementMinutes: 35, props: ["10 balls"], country: "" }, []));
  assert.ok(user.includes("- Activity 2: applied game: 16 min (movement 14 min)") && user.includes("general hydration and heat advice") && user.includes("(Phase 3;"));
});

test("unit timeline prompt: multi-skill, match-play summative, goal setting for Grades 3–5", () => {
  const g1 = sequencePrompt(unit, [], []).user, g4 = sequencePrompt({ ...unit, grade: "Grade 4" }, [], []).user;
  assert.match(g1, /never plan around one named sport/);
  assert.match(g1, /match play or a modified game/);
  assert.ok(!g1.includes("Include goal setting") && g4.includes("Include goal setting"));
});

test("after generation: exact minutes, verified IB outcomes, props outside the list flagged", () => {
  const lesson = { phases: Array.from({ length: 5 }, () => ({ minutes: 1, movement_minutes: 1 })), ib_strands: ["Movement", "Cricket"],
    ib_outcomes: [IB_PSPE.Movement.outcomes["2"][0], "made-up outcome"], equipment: ["12 cones", "24 bean bags", "6 hockey sticks"] };
  applyLessonRules(lesson, { mode: "unit", unit, plan: {} });
  assert.deepEqual(lesson.phases.map((p) => p.minutes), [3, 6, 10, 14, 7]);
  assert.equal(lesson.movement_min, 30);
  assert.deepEqual(lesson.ib_strands, ["Movement"]);
  assert.deepEqual(lesson.ib_outcomes, [IB_PSPE.Movement.outcomes["2"][0]]);
  assert.deepEqual(lesson.equipment, ["12 cones", "24 bean bags", "6 hockey sticks (not in your props list)"]);
});

test("/api/lesson (direct prompt) accepts the new inputs and returns rule-checked output", async () => {
  let prompt = "";
  globalThis.fetch = async (_u, init) => {
    const body = JSON.parse(init.body);
    const out = body.model === "claude-haiku-5-5" ? { verdict: "SAFE", category: "none", reason: "" }
      : (prompt = body.messages[0].content, { title: "Magic Ball", grade: "Grade 4", duration_min: 0, movement_min: 0, focus: "f",
        outcome_skill: "Students will throw", outcome_physical: "Students will move", outcome_cognitive: "Students will choose", outcome_life_skill: "Students will cooperate",
        ib_strands: ["Movement"], ib_outcomes: [], learning_intentions: [], success_criteria: [], atl: [], learner_profile: [], equipment: ["10 balls"],
        space_setup: "s", space_setup_points: [], space_diagram: "area 20 12", tuning_in_question: "q?", phases: [], reflection_skill: [], reflection_cognitive: [],
        reflection_life_skill: [], feedback_focus: "f", small_goal: "g", assessment: { strategy: "s", evidence: "e" }, safety_and_safeguarding: ["Check the space"] });
    return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(out) }] }) };
  };
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ n: 0 }), run: async () => {}, all: async () => ({ results: [] }) }) }) };
  const env = { ALLOWED_ORIGINS: "https://site", MODEL: "claude-sonnet-5-5", SAFETY_MODEL: "claude-haiku-5-5", GUARDRAIL_LLM_CHECK: "true", ANTHROPIC_API_KEY: "k", DB };
  const res = await worker.fetch(new Request("https://w/api/lesson", { method: "POST", headers: { origin: "https://site", "content-type": "application/json" },
    body: JSON.stringify({ mode: "prompt", prompt: "Throwing at targets", grade: "Grade 4", minutes: 45, movementMinutes: 35, props: ["10 balls"], space: "Field", rigorous: true, useRag: false }) }),
  env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  const { lesson } = await res.json();
  assert.equal(lesson.duration_min, 45);
  assert.equal(lesson.movement_min, 35);
  assert.ok(prompt.includes("Props available (use ONLY these): 10 balls") && prompt.includes("Space: Field") && prompt.includes("MORE RIGOROUS") && prompt.includes("(Phase 4;"));
});
