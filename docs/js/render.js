// HTML renderers for unit and lesson documents (screen + print share the same markup).
window.Render = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p class='empty'>—</p>");
  const tags = (arr) => (arr && arr.length ? arr.map((x) => `<span class="tag">${esc(x)}</span>`).join("") : "—");
  const ratio = (b, g) => { const t = b + g; return t ? `${Math.round((b / t) * 100)} : ${Math.round((g / t) * 100)} (boys : girls, ${t} students)` : "—"; };

  function unit(u, { editable = false } = {}) {
    const rows = u.sequence.map((s, idx) => {
      const lessonId = s.lessonId && Store.getLesson(s.lessonId) ? s.lessonId : "";
      return `<tr>
        <td>W${s.week}</td><td>C${s.cls}</td>
        <td class="seq-cell" ${editable ? `contenteditable="true" data-idx="${idx}" data-field="focus"` : ""}>${esc(s.focus)}</td>
        <td class="seq-cell" ${editable ? `contenteditable="true" data-idx="${idx}" data-field="outcome"` : ""}>${esc(s.outcome)}</td>
        ${editable ? `<td class="no-print-inline">
          ${lessonId ? `<button class="btn sm" data-open-lesson="${lessonId}">Open lesson</button>` : ""}
          <button class="btn sm" data-gen-lesson="${idx}">${lessonId ? "Regenerate" : "Generate lesson"}</button></td>` : ""}
      </tr>`;
    }).join("");

    return `<article class="doc">
      <h1>${esc(u.title)}</h1>
      <div class="meta">IB PYP · PSPE unit plan · ${esc(u.grade)} · ${esc(u.phase)} · ${esc(u.context)}</div>

      <h4>Overview</h4>
      <dl class="kv">
        <dt>Strand(s)</dt><dd>${tags(u.strands)}</dd>
        <dt>Key concept(s)</dt><dd>${tags(u.keyConcepts)}</dd>
        <dt>Central idea</dt><dd>${esc(u.centralIdea) || "—"}</dd>
        <dt>Duration</dt><dd>${u.weeks} weeks × ${u.classesPerWeek} classes/week × ${u.minutesPerClass} min = ${u.weeks * u.classesPerWeek} classes</dd>
        <dt>Class profile</dt><dd>${ratio(u.boys, u.girls)}</dd>
        <dt>Facilities &amp; equipment</dt><dd>${esc(u.facilities) || "—"}</dd>
      </dl>

      <h4>Lines of inquiry</h4>${list(u.linesOfInquiry)}
      <h4>Learning outcomes</h4>${list(u.outcomes)}
      <h4>Approaches to Learning</h4><p>${tags(u.atl)}</p>
      <h4>Learner Profile attributes</h4><p>${tags(u.lp)}</p>

      <h4>Assessment</h4>
      <dl class="kv"><dt>Formative</dt><dd>${esc(u.formative) || "—"}</dd><dt>Summative</dt><dd>${esc(u.summative) || "—"}</dd></dl>

      <h4>Class sequence ${editable ? `<span class="hint no-print-inline">— click a cell to edit</span>` : ""}</h4>
      <table><thead><tr><th>Week</th><th>Class</th><th>Focus</th><th>Outcome addressed</th>${editable ? `<th class="no-print-inline"></th>` : ""}</tr></thead>
      <tbody>${rows}</tbody></table>
    </article>`;
  }

  function lesson(l) {
    const phases = (l.phases || []).map((p) => `<tr>
      <td><b>${esc(p.name)}</b><div class="phase-min">${esc(p.minutes)} min</div></td>
      <td>${esc(p.activity)}${p.organisation ? `<div class="hint">Organisation: ${esc(p.organisation)}</div>` : ""}</td>
      <td>${list(p.teaching_points)}</td>
      <td>${p.differentiation ? `<b>Support:</b> ${esc(p.differentiation.support)}<br><b>Extend:</b> ${esc(p.differentiation.extend)}` : "—"}</td>
    </tr>`).join("");
    const total = (l.phases || []).reduce((a, p) => a + Number(p.minutes || 0), 0);

    return `<article class="doc">
      <h1>${esc(l.title)}</h1>
      <div class="meta">IB PYP · PSPE lesson plan · ${esc(l.grade)} · ${esc(l.duration_min)} min${l.unit_title ? ` · Unit: ${esc(l.unit_title)}` : ""}</div>

      <dl class="kv">
        <dt>Focus</dt><dd>${esc(l.focus)}</dd>
        <dt>Key concept(s)</dt><dd>${tags(l.key_concepts)}</dd>
        <dt>ATL</dt><dd>${tags(l.atl)}</dd>
        <dt>Learner Profile</dt><dd>${tags(l.learner_profile)}</dd>
        <dt>Equipment</dt><dd>${(l.equipment || []).map(esc).join(", ") || "—"}</dd>
        <dt>Space set-up</dt><dd>${esc(l.space_setup) || "—"}</dd>
      </dl>

      <h4>Learning intentions</h4>${list(l.learning_intentions)}
      <h4>Success criteria</h4>${list(l.success_criteria)}

      <h4>Safety &amp; safeguarding</h4><div class="safety">${list(l.safety_and_safeguarding)}</div>

      <h4>Lesson sequence <span class="hint">(${total} min)</span></h4>
      <table><thead><tr><th style="width:16%">Phase</th><th>Activity</th><th style="width:24%">Teaching points</th><th style="width:24%">Differentiation</th></tr></thead>
      <tbody>${phases}</tbody></table>

      <h4>Inquiry questions</h4>${list(l.inquiry_questions)}
      <h4>Assessment</h4>
      <dl class="kv"><dt>Strategy</dt><dd>${esc(l.assessment?.strategy) || "—"}</dd><dt>Evidence</dt><dd>${esc(l.assessment?.evidence) || "—"}</dd></dl>
      ${l.teacher_notes ? `<h4>Teacher notes</h4><p>${esc(l.teacher_notes)}</p>` : ""}
      ${l.sources && l.sources.length ? `<h4>Sources (knowledge base)</h4><div class="sources">${list(l.sources.map((s) => s.source))}</div>` : ""}
    </article>`;
  }

  return { esc, unit, lesson };
})();
