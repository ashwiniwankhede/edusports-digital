// Draws a lesson's space / formation diagram as SVG from the layout data the AI returns
// (worker/src/prompts.js → DIAGRAM_SCHEMA). Coordinates are metres from the area's top-left.
// The model never draws pictures; this keeps diagrams crisp, on-brand and printable.
window.Diagram = (() => {
  const COL = { cone: "#f08c00", mat: "#4c7bd9", hoop: "#7a3fb0", bench: "#8a94a0", goal: "#455a6f", ball: "#212b36",
    A: "#d7193a", B: "#155898", C: "#2f9e44", D: "#e8a200", "": "#2f9e44", teacher: "#212b36", water: "#1098ad", first_aid: "#d7193a", zone: "#91a3b8", arrow: "#212b36" };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let uid = 0;

  // Expand a 'group' into student positions, in metres.
  function groupDots(g) {
    const n = clamp(Math.round(num(g.n, 6)), 1, 30), x = num(g.x), y = num(g.y);
    const w = num(g.w) || Math.max(2, n * 0.9), h = num(g.h) || 2;
    const out = [];
    if (g.shape === "circle") {
      const r = Math.max(1.2, Math.min(w, h) / 2 || n * 0.25);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    } else if (g.shape === "line") {
      for (let i = 0; i < n; i++) out.push([x - w / 2 + (n === 1 ? w / 2 : (i * w) / (n - 1)), y]);
    } else if (g.shape === "pairs") {
      const p = Math.ceil(n / 2);
      for (let i = 0; i < p; i++) { const px = x - w / 2 + (p === 1 ? w / 2 : (i * w) / (p - 1)); out.push([px, y - h / 4]); if (out.length < n) out.push([px, y + h / 4]); }
    } else { // scatter: an even grid with a fixed wobble, so it looks loose but never clumps
      const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h))), rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols), j = ((i * 37) % 11) / 11 - 0.5, k = ((i * 53) % 13) / 13 - 0.5;
        out.push([x - w / 2 + ((c + 0.5 + j * 0.6) * w) / cols, y - h / 2 + ((r + 0.5 + k * 0.6) * h) / rows]);
      }
    }
    return out;
  }

  function draw(spec, { width = 320, legend = true, label = "Diagram" } = {}) {
    if (!spec || !spec.area) return "";
    const W = clamp(num(spec.area.w, 20), 4, 120), H = clamp(num(spec.area.h, 12), 4, 120);
    const pad = 12, s = (width - pad * 2) / W, h = H * s + pad * 2;
    const X = (x) => pad + clamp(num(x), 0, W) * s, Y = (y) => pad + clamp(num(y), 0, H) * s;
    const id = `ah${++uid}`, used = new Set(), out = [];
    out.push(`<rect x="${pad}" y="${pad}" width="${W * s}" height="${H * s}" rx="6" fill="#f6f8f7" stroke="#9aa4ad" stroke-width="1.2"/>`);
    const small = width < 220; // abstract thumbnails: skip text that would not be readable
    if (spec.area.label && !small) out.push(`<text x="${pad + 5}" y="${pad + 11}" font-size="8.5" fill="#637381">${esc(spec.area.label)} · ${W}×${H} m</text>`);
    for (const z of (spec.zones || []).slice(0, 8)) {
      out.push(`<rect x="${X(z.x)}" y="${Y(z.y)}" width="${clamp(num(z.w), 0, W) * s}" height="${clamp(num(z.h), 0, H) * s}" rx="5" fill="none" stroke="${COL.zone}" stroke-dasharray="4 3"/>`);
      if (z.label && !small) out.push(`<text x="${X(z.x) + 4}" y="${Y(z.y) + 10}" font-size="8.5" font-weight="700" fill="#455a6f">${esc(z.label)}</text>`);
    }
    const dot = (x, y, team) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${clamp(s * 0.35, 3, 5.5)}" fill="${COL[team] || COL[""]}" stroke="#fff" stroke-width="1"/>`;
    const people = [];
    for (const it of (spec.items || []).slice(0, 40)) {
      const x = X(it.x), y = Y(it.y), t = it.type;
      if (t === "group" || t === "student") {
        used.add(`student-${it.team || ""}`);
        for (const [px, py] of t === "group" ? groupDots(it) : [[it.x, it.y]]) people.push(dot(px, py, it.team));
        continue;
      }
      used.add(t);
      const iw = (d) => clamp(num(it.w) || d, 0.3, W) * s, ih = (d) => clamp(num(it.h) || d, 0.2, H) * s;
      if (t === "cone") out.push(`<path d="M${x} ${y - 5}L${x + 4.5} ${y + 3.5}H${x - 4.5}Z" fill="${COL.cone}"/>`);
      else if (t === "mat") out.push(`<rect x="${x - iw(2) / 2}" y="${y - ih(1) / 2}" width="${iw(2)}" height="${ih(1)}" rx="3" fill="${COL.mat}" fill-opacity=".25" stroke="${COL.mat}"/>`);
      else if (t === "hoop") out.push(`<circle cx="${x}" cy="${y}" r="${clamp(0.5 * s, 4, 9)}" fill="none" stroke="${COL.hoop}" stroke-width="2"/>`);
      else if (t === "bench") out.push(`<rect x="${x - iw(3) / 2}" y="${y - 3}" width="${iw(3)}" height="6" rx="2" fill="${COL.bench}"/>`);
      else if (t === "goal") out.push(`<rect x="${x - iw(3) / 2}" y="${y - ih(1) / 2}" width="${iw(3)}" height="${ih(1)}" fill="none" stroke="${COL.goal}" stroke-width="2.5"/>`);
      else if (t === "ball") out.push(`<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="${COL.ball}" stroke-width="1.4"/>`);
      else if (t === "teacher") out.push(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="${COL.teacher}"/><text x="${x}" y="${y + 3.5}" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">T</text>`);
      else if (t === "water") out.push(`<circle cx="${x}" cy="${y}" r="6" fill="${COL.water}"/><text x="${x}" y="${y + 3}" font-size="8" fill="#fff" text-anchor="middle">W</text>`);
      else if (t === "first_aid") out.push(`<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="#fff" stroke="${COL.first_aid}"/><path d="M${x - 3.5} ${y}H${x + 3.5}M${x} ${y - 3.5}V${y + 3.5}" stroke="${COL.first_aid}" stroke-width="2"/>`);
    }
    out.push(...people); // students on top of equipment
    for (const r of (spec.arrows || []).slice(0, 6)) {
      const dashed = r.kind === "pass" || r.kind === "rotate";
      used.add(dashed ? "pass" : "move");
      out.push(`<path d="M${X(r.from_x)} ${Y(r.from_y)} L${X(r.to_x)} ${Y(r.to_y)}" fill="none" stroke="${COL.arrow}" stroke-width="1.4"${dashed ? ' stroke-dasharray="3 3"' : ""} marker-end="url(#${id})"/>`);
    }

    const ICON = {
      cone: ["Cone", (x, y) => `<path d="M${x} ${y - 5}L${x + 4.5} ${y + 3.5}H${x - 4.5}Z" fill="${COL.cone}"/>`],
      mat: ["Mat", (x, y) => `<rect x="${x - 6}" y="${y - 4}" width="12" height="8" rx="2" fill="${COL.mat}" fill-opacity=".25" stroke="${COL.mat}"/>`],
      hoop: ["Hoop", (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${COL.hoop}" stroke-width="2"/>`],
      bench: ["Bench", (x, y) => `<rect x="${x - 7}" y="${y - 3}" width="14" height="6" rx="2" fill="${COL.bench}"/>`],
      goal: ["Goal", (x, y) => `<rect x="${x - 7}" y="${y - 4}" width="14" height="8" fill="none" stroke="${COL.goal}" stroke-width="2"/>`],
      ball: ["Ball", (x, y) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="${COL.ball}" stroke-width="1.4"/>`],
      teacher: ["Teacher", (x, y) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="3" fill="${COL.teacher}"/>`],
      water: ["Water", (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="${COL.water}"/>`],
      first_aid: ["First aid", (x, y) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="#fff" stroke="${COL.first_aid}"/><path d="M${x - 3.5} ${y}H${x + 3.5}M${x} ${y - 3.5}V${y + 3.5}" stroke="${COL.first_aid}" stroke-width="2"/>`],
      "student-": ["Students", (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${COL[""]}"/>`],
      "student-A": ["Group A", (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${COL.A}"/>`],
      "student-B": ["Group B", (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${COL.B}"/>`],
      "student-C": ["Group C", (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${COL.C}"/>`],
      "student-D": ["Group D", (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${COL.D}"/>`],
      move: ["Movement", (x, y) => `<path d="M${x - 8} ${y}H${x + 6}" stroke="${COL.arrow}" stroke-width="1.4" marker-end="url(#${id})"/>`],
      pass: ["Pass / rotate", (x, y) => `<path d="M${x - 8} ${y}H${x + 6}" stroke="${COL.arrow}" stroke-width="1.4" stroke-dasharray="3 3" marker-end="url(#${id})"/>`],
    };
    let leg = "", lx = pad, ly = h + 4;
    if (legend) for (const k of Object.keys(ICON)) if (used.has(k)) {
      const [name, icon] = ICON[k];
      if (lx + 24 + name.length * 5.2 > width) { lx = pad; ly += 15; }
      leg += icon(lx + 6, ly + 6) + `<text x="${lx + 15}" y="${ly + 9}" font-size="8.5" fill="#455a6f">${name}</text>`;
      lx += 22 + name.length * 5.2;
    }
    const total = leg ? ly + 16 : h;
    return `<svg class="dgm" viewBox="0 0 ${width} ${total}" width="${width}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`
      + `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${COL.arrow}"/></marker></defs>`
      + out.join("") + leg + `</svg>`;
  }

  return { draw, groupDots };
})();
