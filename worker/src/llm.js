// Provider-agnostic "give me JSON matching this schema" call.
// Anthropic: forced tool use (most reliable structured output).
// OpenAI: JSON mode with the schema in the system prompt.

export async function callJSON(env, { model, system, user, schema, schemaName = "result", maxTokens = 4000 }) {
  const provider = (env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (provider === "openai") return openai(env, { model, system, user, schema, maxTokens });
  return anthropic(env, { model, system, user, schema, schemaName, maxTokens });
}

async function anthropic(env, { model, system, user, schema, schemaName, maxTokens }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || env.MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: schemaName, description: "Return the result in this exact structure.", input_schema: schema }],
      tool_choice: { type: "tool", name: schemaName },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${data?.error?.message || "error"}`);
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block) throw new Error("Model returned no structured output");
  return block.input;
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
