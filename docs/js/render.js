// HTML renderers for unit and lesson documents (screen + print share the same markup).
window.Render = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p class='empty'>—</p>");
  const tags = (arr) => (arr && arr.length ? arr.map((x) => `<span class="tag">${esc(x)}</span>`).join("") : "—");

  // ── Unit plan: follows the PSPE / PE planning template (screen + A4 landscape print) ──
  const ul = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const joined = (arr, sep = ", ") => esc((arr || []).join(sep));
  const fact = (label, value, cls = "") => `<div class="${cls}"><span>${label}</span>${value || "—"}</div>`;
  const today = () => new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy — the plan always shows the day it is viewed or printed
  const MAX_COLS = 8; // timeline columns that fit on a landscape page

  // Split the timeline week by week into the fewest pages of ≤ MAX_COLS columns, with the
  // same number of weeks — so the same number of columns — on every page.
  // e.g. 6 weeks × 2 → 2 pages of 3 weeks (6 columns); 5 weeks × 2 → 3 + 2 weeks, last page padded.
  function timelineLayout(weeks, perWeek) {
    const maxWeeks = Math.max(1, Math.floor(MAX_COLS / Math.max(1, perWeek)));
    const pages = Math.ceil(weeks / maxWeeks);
    const weeksPerPage = Math.ceil(weeks / pages);
    return { pages, weeksPerPage, cols: weeksPerPage * perWeek };
  }

  // An answer block: text, or blank ruled lines on paper when empty. Editable on screen when `field` is set.
  function answer(text, editable, field) {
    if (editable && field) return `<div class="ans edit" contenteditable="true" data-unit-field="${field}" data-ph="Click to add">${esc(text)}</div>`;
    return text ? `<div class="ans">${esc(text)}</div>` : `<div class="ans empty"></div>`;
  }

  function timeline(u, editable) {
    const seq = u.sequence || [];
    const cell = (idx, field, value) => editable
      ? `<div contenteditable="true" class="edit" data-idx="${idx}" data-field="${field}" data-ph="—">${esc(value)}</div>` : esc(value);
    const ROWS = [
      ["Lesson Plan code &amp; name", (s, i) => editable
        ? `<div contenteditable="true" class="edit code" data-idx="${i}" data-field="code" data-ph="Code">${esc(s.code)}</div>${cell(i, "name", s.name)}`
        : `${s.code ? `<b>${esc(s.code)}</b><br>` : ""}${esc(s.name)}`],
      ["Conceptual focus (PSPE / TD)", (s, i) => cell(i, "focus", s.focus)],
      ["Learning outcomes", (s, i) => `${(s.los || []).map((x) => `<span class="lo">${esc(x)}</span>`).join(" ")}${cell(i, "outcome", s.outcome)}`],
      ["Key concept focus", (s, i) => cell(i, "keyConcept", s.keyConcept)],
      ["Learner profile", (s, i) => cell(i, "lp", s.lp)],
      ["Approaches to learning", (s, i) => cell(i, "atl", s.atl)],
      ["Formative/ summative assessment", (s, i) => cell(i, "assessment", s.assessment)],
    ];
    const { cols } = timelineLayout(u.weeks || 1, u.classesPerWeek || 1);
    const pages = [];
    for (let start = 0; start < seq.length; start += cols) {
      const part = seq.slice(start, start + cols);
      const pad = (html) => html.repeat(cols - part.length); // blank columns keep every page the same width
      const title = seq.length > cols ? `Unit time line: weeks ${part[0].week}–${part[part.length - 1].week} of ${u.weeks}` : "Unit time line:";
      const head = part.map((s, j) => `<th>W${s.week} / L${start + j + 1}</th>`).join("") + pad("<th></th>");
      const body = ROWS.map(([label, fn]) => `<tr><th class="rowh">${label}</th>${part.map((s, j) => `<td>${fn(s, start + j)}</td>`).join("")}${pad("<td></td>")}</tr>`).join("");
      const buttons = editable ? `<tr class="no-print-inline"><th class="rowh">Lesson plan</th>${part.map((s, j) => {
        const idx = start + j, lessonId = s.lessonId && Store.getLesson(s.lessonId) ? s.lessonId : "";
        return `<td>${lessonId ? `<button class="btn sm" data-open-lesson="${lessonId}">Open</button> ` : ""}<button class="btn sm" data-gen-lesson="${idx}">${lessonId ? "Regenerate" : "Generate"}</button></td>`;
      }).join("")}${pad("<td></td>")}</tr>` : "";
      pages.push(`<table class="tl pb"><thead><tr class="band"><th colspan="${cols + 1}">${title}</th></tr>
        <tr><th class="rowh">Week/ Lesson #</th>${head}</tr></thead><tbody>${body}${buttons}</tbody></table>`);
    }
    return pages.join("");
  }

  function unit(u, { editable = false } = {}) {
    const total = u.weeks * u.classesPerWeek;
    const students = (u.boys || 0) + (u.girls || 0);
    const slo = [["Movement", u.sloMovement], ["Wellness", u.sloWellness], ["Interactions", u.sloInteractions], ["Identity", u.sloIdentity]];
    const qa = (qs) => qs.map(([q, text, field]) => `<div class="q">${q}</div>${answer(text, editable, field)}`).join("");

    return `<article class="doc u">
      <h1>${esc(u.grade)} Unit Planner</h1>
      <div class="facts">
        ${fact("Grade", esc(u.grade))}${fact("Unit #", esc(u.unitNo))}${fact("Unit title", esc(u.title), "w2")}
        ${fact("Date", today())}${fact("Duration", `${u.weeks} weeks × ${u.classesPerWeek} classes × ${u.minutesPerClass} min (${total} lessons)`)}
        ${fact("Movement context", esc(u.context), "w2")}
        ${fact("Class profile", students ? `${students} students (${u.boys || 0} boys, ${u.girls || 0} girls)` : "")}
        ${u.name ? fact("Name", esc(u.name), "w3") : ""}
      </div>

      <div class="sh">1. The Unit of Inquiry <small>What is being focussed on in each layer?</small></div>
      <div class="uoi">
        ${fact("Transdisciplinary theme", esc(u.theme), "w2")}${fact("Central idea", esc(u.centralIdea), "w2")}
        ${fact("Lines of inquiry", ul(u.linesOfInquiry), "w2")}
        ${fact("Key concepts", joined(u.keyConcepts))}${fact("Learner Profile attributes", joined(u.lp))}
        ${fact("ATL skills", joined(u.atl, " · "), "w2")}
      </div>

      <div class="sh">Unit Learning Outcomes <small>By the end of the unit, students will be able to…</small></div>
      <ol class="los">${(u.outcomes || []).map((o, i) => `<li><b>LO${i + 1}</b>${esc(o)}</li>`).join("")}</ol>

      <table class="pb">
        <tr class="band"><th colspan="3" class="big">Unit Success criteria Planner</th></tr>
        <tr class="colh"><th>Knowledge<small>What do we want students to know at the end of the unit? Facts and information</small></th>
          <th>Understandings<small>What conceptual understanding do we want students to gain?</small></th>
          <th>Skills<small>What skills do we want our students to learn? Processes, strategies, ATLs and Learner profiles</small></th></tr>
        <tr class="tall"><td>${ul(u.knowledge)}</td><td>${ul(u.understandings)}</td><td>${ul(u.skills)}</td></tr>
      </table>
      <div class="h3">Assessment Approach and Summary</div>
      <table>
        <tr><td class="lbl">1. What is being assessed<small>skills, concepts, behaviours</small></td><td>${esc(u.assessWhat)}</td></tr>
        <tr><td class="lbl">2. How it is assessed<small>observation, peer feedback, reflection</small></td><td>${esc(u.assessHow)}</td></tr>
        <tr><td class="lbl">3. When<small>formative vs summative moments</small></td><td>${esc(u.assessWhen)}</td></tr>
      </table>

      <table class="pb">
        <tr class="band"><th colspan="4" class="big">Unit Planner</th></tr>
        <tr class="band"><th colspan="4">Transdisciplinary (TD) learning concepts - <small>what parts of the central theme and which LOIs will your transdisciplinary learning focus on?</small></th></tr>
        <tr class="mid"><td colspan="4">${esc(u.tdConcepts)}</td></tr>
        <tr class="band"><th colspan="4">PSPE Student Learning concepts and learning outcomes - <small>what SLC and SLOs will drive the learning in this unit?</small></th></tr>
        <tr class="colh">${slo.map(([h]) => `<th>${h}</th>`).join("")}</tr>
        <tr class="mid">${slo.map(([, v]) => `<td>${ul(v)}</td>`).join("")}</tr>
      </table>
      <table>
        <tr class="band"><th colspan="3">What key and additional concepts will guide the inquiry? What Learner profiles and Approaches to learning are we looking to develop to support the learning in this unit?</th></tr>
        <tr class="colh"><th>Key and additional concepts</th><th>Learner profiles</th><th>Approaches to Learning</th></tr>
        <tr class="mid"><td>${u.keyConcepts?.length ? `Key: ${joined(u.keyConcepts)}` : ""}${u.additionalConcepts ? `<br>Additional: ${esc(u.additionalConcepts)}` : ""}</td>
          <td>${joined(u.lp)}</td><td>${ul(u.atl)}</td></tr>
      </table>

      ${timeline(u, editable)}

      <div class="pb h3">Unit rationale</div>
      ${qa([["1. What is the main learning this unit is trying to develop?", u.ratLearning],
        ["2. Why is PE the right place for this learning? (What will students <i>experience or do</i> through movement that makes this learning meaningful?)", u.ratWhyPE],
        ["3. What kinds of student behaviours or skills will this unit intentionally develop?", u.ratBehaviours]])}
      <div class="h3">End of Unit reflection ${editable ? `<span class="hint no-print-inline">— fill in after teaching the unit</span>` : ""}</div>
      ${qa([["1. What worked well?", u.refWorked, "refWorked"], ["2. What did students struggle with?", u.refStruggled, "refStruggled"],
        ["3. What would you adjust next time?", u.refAdjust, "refAdjust"], ["4. How does this inform the next unit?", u.refInforms, "refInforms"]])}
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
      <div class="meta">${l.lesson_code ? `${esc(l.lesson_code)} · ` : ""}Lesson plan · ${esc(l.grade)} · ${esc(l.duration_min)} min${l.unit_title ? ` · Unit: ${esc(l.unit_title)}` : ""}</div>

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

      <h4>Lesson sequence <span class="hint">(${total} min)</span></h4>
      <table><thead><tr><th style="width:16%">Phase</th><th>Activity</th><th style="width:24%">Teaching points</th><th style="width:24%">Differentiation</th></tr></thead>
      <tbody>${phases}</tbody></table>

      <h4>Inquiry questions</h4>${list(l.inquiry_questions)}
      <h4>Assessment</h4>
      <dl class="kv"><dt>Strategy</dt><dd>${esc(l.assessment?.strategy) || "—"}</dd><dt>Evidence</dt><dd>${esc(l.assessment?.evidence) || "—"}</dd></dl>
      ${l.teacher_notes ? `<h4>Teacher notes</h4><p>${esc(l.teacher_notes)}</p>` : ""}
      ${l.sources && l.sources.length ? `<h4>Sources (knowledge base)</h4><div class="sources">${list(l.sources.map((s) => s.source))}</div>` : ""}

      <h4>Safety &amp; safeguarding</h4><div class="safety">${list(l.safety_and_safeguarding)}</div>
    </article>`;
  }

  return { esc, unit, lesson, timelineLayout };
})();
