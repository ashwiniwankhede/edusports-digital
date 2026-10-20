// Anonymous usage analytics stored in D1.

export async function ipHash(env, request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.IP_SALT || "salt"}:${ip}`));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function logEvent(env, { type, anonId, ipHash, payload }) {
  const json = payload ? JSON.stringify(payload).slice(0, 16000) : null;
  await env.DB.prepare("INSERT INTO events (ts, type, anon_id, ip_hash, payload) VALUES (?, ?, ?, ?, ?)")
    .bind(Date.now(), type, (anonId || "").slice(0, 64) || null, ipHash || null, json).run();
}

const AI_TYPES = "('lesson_generated','sequence_generated')";

/** Returns an error string if this visitor or the whole site is over its limit. */
export async function overLimit(env, ip) {
  const hourAgo = Date.now() - 3600_000;
  const perHour = Number(env.RATE_LIMIT_PER_HOUR || 30);
  const mine = await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE ip_hash = ? AND ts > ? AND type IN ${AI_TYPES}`)
    .bind(ip, hourAgo).first();
  if (mine.n >= perHour) return `Limit of ${perHour} generations per hour reached. Please try again later.`;

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const cap = Number(env.DAILY_GENERATION_CAP || 1000);
  const all = await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE ts > ? AND type IN ${AI_TYPES}`)
    .bind(dayStart.getTime()).first();
  if (all.n >= cap) return "The planner has reached today's generation limit. Please try again tomorrow.";
  return null;
}

export async function stats(env, days = 30) {
  const since = Date.now() - days * 86400_000;
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [uAll, uPeriod, counts, daily, recentLessons, recentUnits, recentBlocked] = await env.DB.batch([
    q("SELECT COUNT(DISTINCT anon_id) AS n FROM events WHERE anon_id IS NOT NULL"),
    q("SELECT COUNT(DISTINCT anon_id) AS n FROM events WHERE anon_id IS NOT NULL AND ts > ?", since),
    q("SELECT type, COUNT(*) AS n FROM events WHERE ts > ? GROUP BY type", since),
    q(`SELECT date(ts/1000,'unixepoch') AS day,
          COUNT(DISTINCT anon_id) AS users,
          SUM(type='lesson_generated') AS lessons,
          SUM(type='unit_created') AS units,
          SUM(type='blocked') AS blocked
        FROM events WHERE ts > ? GROUP BY day ORDER BY day`, since),
    q("SELECT ts, anon_id, payload FROM events WHERE type='lesson_generated' ORDER BY ts DESC LIMIT 100"),
    q("SELECT ts, anon_id, payload FROM events WHERE type='unit_created' ORDER BY ts DESC LIMIT 100"),
    q("SELECT ts, anon_id, payload FROM events WHERE type='blocked' ORDER BY ts DESC LIMIT 100"),
  ]);
  const parse = (rows) => rows.results.map((r) => ({ ...r, payload: safeParse(r.payload) }));
  return {
    days,
    unique_users_all_time: uAll.results[0].n,
    unique_users_period: uPeriod.results[0].n,
    counts: Object.fromEntries(counts.results.map((r) => [r.type, r.n])),
    daily: daily.results,
    recent_lessons: parse(recentLessons),
    recent_units: parse(recentUnits),
    recent_blocked: parse(recentBlocked),
  };
}

export async function exportEvents(env, type) {
  const stmt = type
    ? env.DB.prepare("SELECT id, ts, type, anon_id, payload FROM events WHERE type = ? ORDER BY ts DESC LIMIT 50000").bind(type)
    : env.DB.prepare("SELECT id, ts, type, anon_id, payload FROM events ORDER BY ts DESC LIMIT 50000");
  const { results } = await stmt.all();
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["id,timestamp,type,anon_id,payload", ...results.map((r) =>
    [r.id, new Date(r.ts).toISOString(), r.type, r.anon_id, r.payload].map(cell).join(","))].join("\n");
}

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }
