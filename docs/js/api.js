// Talks to the Cloudflare Worker. With no API_BASE configured, falls back to demo mode.
window.Api = (() => {
  const base = (window.APP_CONFIG.API_BASE || "").replace(/\/$/, "");
  const demo = !base;

  // Anonymous, random visitor id — used only to count unique users.
  function anonId() {
    try {
      let id = localStorage.getItem("pspe_anon_id");
      if (!id) { id = Store.uid(); localStorage.setItem("pspe_anon_id", id); }
      return id;
    } catch (_) { return "no-storage"; }
  }

  async function post(path, body) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Anon-Id": anonId() },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Request failed (${res.status})`);
      err.code = data.error; err.status = res.status;
      throw err;
    }
    return data;
  }

  // Fire-and-forget analytics. Never blocks the UI.
  function track(type, payload = {}) {
    if (demo) return;
    try {
      const body = JSON.stringify({ type, payload, anon_id: anonId() });
      if (navigator.sendBeacon) navigator.sendBeacon(base + "/api/track", new Blob([body], { type: "text/plain" }));
      else fetch(base + "/api/track", { method: "POST", body, keepalive: true });
    } catch (_) {}
  }

  return {
    demo,
    track,
    async generateLesson(req) {
      if (demo) { await new Promise((r) => setTimeout(r, 600)); return { lesson: Demo.lesson(req) }; }
      return post("/api/lesson", req);
    },
    async draftSequence(unit) {
      if (demo) { await new Promise((r) => setTimeout(r, 400)); return { sequence: Demo.sequence(unit) }; }
      return post("/api/unit-sequence", { unit });
    },
  };
})();
