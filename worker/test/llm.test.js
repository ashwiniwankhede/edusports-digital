import { test } from "node:test";
import assert from "node:assert/strict";
import { strictSchema, anthropicRequest, parseAnthropic } from "../src/llm.js";
import { LESSON_SCHEMA, SEQUENCE_SCHEMA } from "../src/prompts.js";

const env = { MODEL: "claude-sonnet-5-5", ANTHROPIC_API_KEY: "k" };
const objects = (s, out = []) => {
  if (Array.isArray(s)) s.forEach((x) => objects(x, out));
  else if (s && typeof s === "object") { if (s.type === "object") out.push(s); Object.values(s).forEach((x) => objects(x, out)); }
  return out;
};

test("every object in the lesson and sequence schemas is closed", () => {
  for (const schema of [LESSON_SCHEMA, SEQUENCE_SCHEMA]) {
    const all = objects(strictSchema(schema));
    assert.ok(all.length > 1);
    for (const o of all) assert.equal(o.additionalProperties, false);
  }
  assert.equal(LESSON_SCHEMA.additionalProperties, undefined, "source schema is not mutated");
});

test("request uses structured outputs, never forced tool_choice", () => {
  const { body, headers } = anthropicRequest(env, { system: "s", user: "u", schema: LESSON_SCHEMA, maxTokens: 16000 });
  assert.equal(body.tool_choice, undefined);
  assert.equal(body.tools, undefined);
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.fallbacks, "default");
  assert.equal(headers["anthropic-beta"], "server-side-fallback-2026-07-01");
});

test("safety classifier request sets effort and skips fallback on Haiku", () => {
  const { body, headers } = anthropicRequest(env, { model: "claude-haiku-5-5", system: "s", user: "u", schema: { type: "object", properties: {} }, maxTokens: 1024, effort: "low" });
  assert.equal(body.output_config.effort, "low");
  assert.equal(body.fallbacks, undefined);
  assert.equal(headers["anthropic-beta"], undefined);
});

test("parses JSON from the last text block, after thinking", () => {
  const data = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"title":"T"}' }] };
  assert.deepEqual(parseAnthropic(data), { title: "T" });
});

test("refusal and truncation raise clear errors", () => {
  assert.throws(() => parseAnthropic({ stop_reason: "refusal", stop_details: { category: "general_harms" }, content: [] }), /refusal: general_harms/);
  assert.throws(() => parseAnthropic({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"ti' }] }), /cut off/);
});
