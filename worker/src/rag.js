// Retrieval-augmented generation over your own documents.
// Text chunks → Workers AI embeddings → Vectorize index; chunk text kept in D1.

export function chunkText(text, size = 1200, overlap = 200) {
  const clean = String(text).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n/);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length <= size) { cur = cur ? cur + "\n\n" + p : p; continue; }
    if (cur) chunks.push(cur);
    if (p.length <= size) { cur = (chunks.length ? tail(chunks[chunks.length - 1], overlap) + "\n\n" : "") + p; continue; }
    // very long paragraph: hard-split with overlap
    for (let i = 0; i < p.length; i += size - overlap) chunks.push(p.slice(i, i + size));
    cur = "";
  }
  if (cur) chunks.push(cur);
  return chunks;
}
const tail = (s, n) => (s.length <= n ? s : s.slice(s.length - n).replace(/^\S*\s/, ""));

async function embed(env, texts) {
  const out = await env.AI.run(env.EMBED_MODEL || "@cf/baai/bge-base-en-v1.5", { text: texts });
  return out.data;
}

const idFor = async (source, i) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${source}#${i}`));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Add chunks for a source. `chunks` = [{index, text}]. Call deleteSource first to replace. */
export async function ingestChunks(env, source, chunks) {
  const BATCH = 20;
  let n = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH).filter((c) => c.text && c.text.trim());
    if (!batch.length) continue;
    const vectors = await embed(env, batch.map((c) => c.text));
    const ids = await Promise.all(batch.map((c) => idFor(source, c.index)));
    await env.VECTORS.upsert(batch.map((c, j) => ({ id: ids[j], values: vectors[j], metadata: { source } })));
    const now = Date.now();
    await env.DB.batch(batch.map((c, j) =>
      env.DB.prepare("INSERT OR REPLACE INTO chunks (id, source, chunk_index, text, created) VALUES (?, ?, ?, ?, ?)")
        .bind(ids[j], source, c.index, c.text, now)));
    n += batch.length;
  }
  return n;
}

export async function deleteSource(env, source) {
  const { results } = await env.DB.prepare("SELECT id FROM chunks WHERE source = ?").bind(source).all();
  const ids = results.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) await env.VECTORS.deleteByIds(ids.slice(i, i + 100));
  await env.DB.prepare("DELETE FROM chunks WHERE source = ?").bind(source).run();
  return ids.length;
}

export async function listSources(env) {
  const { results } = await env.DB.prepare(
    "SELECT source, COUNT(*) AS chunks, MAX(created) AS updated FROM chunks GROUP BY source ORDER BY updated DESC").all();
  return results;
}

/** Top-k relevant chunks for a query, filtered by a minimum similarity score. */
export async function retrieve(env, query, k) {
  if (!query || !env.VECTORS) return [];
  const [vec] = await embed(env, [query.slice(0, 2000)]);
  const res = await env.VECTORS.query(vec, { topK: k || Number(env.RAG_TOP_K || 5) });
  const min = Number(env.RAG_MIN_SCORE || 0.55);
  const hits = (res.matches || []).filter((m) => m.score >= min);
  if (!hits.length) return [];
  const placeholders = hits.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT id, source, text FROM chunks WHERE id IN (${placeholders})`)
    .bind(...hits.map((h) => h.id)).all();
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  return hits.map((h) => byId[h.id] && { ...byId[h.id], score: h.score }).filter(Boolean);
}
