(() => {
  const C = window.APP_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = Render.esc;

  // ───────── branding ─────────
  $("#brandProduct").textContent = C.PRODUCT_NAME;
  $("#brandCompany").textContent = C.COMPANY_NAME;
  $("#brandLogo").src = C.LOGO_URL || C.WATERMARK_URL;
  $("#brandLogo").alt = C.COMPANY_NAME;
  document.title = C.PRODUCT_NAME;
  if (Api.demo) $("#demoBanner").hidden = false;
  Api.track("visit");

  // ───────── helpers ─────────
  function toast(msg, isError = false) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast no-print" + (isError ? " error" : ""); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), isError ? 6000 : 2500);
  }
  const options = (sel, arr) => (sel.innerHTML = arr.map((x) => `<option>${esc(x)}</option>`).join(""));
  const chips = (box, name, arr) => (box.innerHTML = arr.map((x) => `<label class="chip"><input type="checkbox" name="${name}" value="${esc(x)}"><span>${esc(x)}</span></label>`).join(""));
  const checked = (form, name) => $$(`input[name="${name}"]:checked`, form).map((i) => i.value);
  const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.innerHTML = `<span class="spinner"></span>${label}`; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label; btn.disabled = false; }
  }

  // ───────── tabs ─────────
  const TAB_COPY = {
    unit: ["Unit Plan Builder", "Follows the PSPE / PE planning template. Fill in the unit, then build its timeline lesson by lesson."],
    lesson: ["AI Lesson Plan Builder", "Generate a full lesson plan from a unit class or a direct prompt."],
    library: ["My Plans", "Unit and lesson plans saved in this browser."],
  };
  function showTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    const [title, sub] = TAB_COPY[name];
    $("#topbarTitle").textContent = $("#heroTitle").textContent = title;
    $("#heroSub").textContent = sub;
    $$(".panel").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
    if (name === "lesson") refreshLessonUnitSelect();
    if (name === "library") renderLibrary();
    window.scrollTo({ top: 0 });
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  // ───────── unit form setup ─────────
  const uf = $("#unitForm");
  options($("#contextSel"), IB.contexts);
  options($("#gradeSel"), IB.grades);
  $("#themeSel").innerHTML = `<option value="">Choose a theme…</option>` + IB.themes.map((x) => `<option>${esc(x)}</option>`).join("");
  options($("#promptGrade"), IB.grades);
  chips($("#kcChips"), "keyConcepts", IB.keyConcepts);
  chips($("#lpChips"), "lp", IB.learnerProfile);
  $("#atlBox").innerHTML = Object.entries(IB.atl).map(([cat, subs]) =>
    `<div class="atl-group"><b>${esc(cat)}</b><div class="chips">${subs.map((s) =>
      `<label class="chip"><input type="checkbox" name="atl" value="${esc(cat)}: ${esc(s)}"><span>${esc(s)}</span></label>`).join("")}</div></div>`).join("");

  function updateRatio() {
    const b = +uf.boys.value || 0, g = +uf.girls.value || 0, t = b + g;
    $("#ratioOut").textContent = t ? `${Math.round((b / t) * 100)} : ${Math.round((g / t) * 100)}` : "—";
  }
  uf.boys.addEventListener("input", updateRatio);
  uf.girls.addEventListener("input", updateRatio);

  // Form inputs are named after the unit fields they hold.
  const TEXT_FIELDS = ["grade", "unitNo", "date", "name", "title", "context", "theme", "centralIdea", "additionalConcepts", "facilities",
    "tdConcepts", "assessWhat", "assessHow", "assessWhen", "ratLearning", "ratWhyPE", "ratBehaviours"];
  const LIST_FIELDS = ["linesOfInquiry", "outcomes", "sloMovement", "sloWellness", "sloInteractions", "sloIdentity", "knowledge", "understandings", "skills"];
  const NUM_FIELDS = ["weeks", "classesPerWeek", "minutesPerClass", "boys", "girls"];
  const CHIP_FIELDS = ["keyConcepts", "atl", "lp"];
  const today = () => new Date().toISOString().slice(0, 10);

  function readUnit() {
    const u = { v: 2, sequence: [] };
    for (const k of TEXT_FIELDS) u[k] = uf[k].value.trim();
    for (const k of LIST_FIELDS) u[k] = lines(uf[k].value);
    for (const k of NUM_FIELDS) u[k] = +uf[k].value || 0;
    for (const k of CHIP_FIELDS) u[k] = checked(uf, k);
    return u;
  }
  function fillForm(u) {
    for (const k of TEXT_FIELDS) uf[k].value = u[k] ?? "";
    for (const k of LIST_FIELDS) uf[k].value = (u[k] || []).join("\n");
    for (const k of NUM_FIELDS) uf[k].value = u[k] ?? "";
    for (const k of CHIP_FIELDS) $$(`input[name="${k}"]`, uf).forEach((i) => (i.checked = (u[k] || []).includes(i.value)));
    updateRatio();
  }
  // Unit fields sent to the AI and to analytics: never the teacher's name, the reflection or the timeline.
  const unitInputs = (u) => {
    const { sequence, id, created, name, refWorked, refStruggled, refAdjust, refInforms, ...rest } = u;
    return rest;
  };

  // Building again while editing updates that plan; lesson codes and links survive by week/class.
  let editingId = null;
  function setEditing(u) {
    editingId = u ? u.id : null;
    $("#editBar").hidden = !u;
    if (u) $("#editTitle").textContent = u.title;
  }
  function saveBuilt(u) {
    const prev = editingId && Store.getUnit(editingId);
    if (prev) {
      Object.assign(u, { id: prev.id, created: prev.created, refWorked: prev.refWorked, refStruggled: prev.refStruggled, refAdjust: prev.refAdjust, refInforms: prev.refInforms });
      for (const s of u.sequence) {
        const old = prev.sequence.find((x) => x.week === s.week && x.cls === s.cls);
        if (old) Object.assign(s, { code: old.code || s.code || "", lessonId: old.lessonId });
      }
    } else Object.assign(u, { id: Store.uid(), created: new Date().toISOString() });
    Store.upsertUnit(u);
    setEditing(u);
    fillForm(u);
    showUnit(u);
  }
  function validUnit() {
    if (!uf.reportValidity()) return false;
    if (!checked(uf, "keyConcepts").length) { toast("Choose at least one key concept.", true); $("#kcChips").scrollIntoView({ block: "center" }); return false; }
    return true;
  }

  let currentUnit = null;
  const unitBar = `<div class="out-bar">
    <button class="btn" data-act="edit-unit">Edit unit details</button>
    <button class="btn" data-act="auto-codes">Auto-assign lesson codes</button>
    <button class="btn" data-act="print-unit">Print / PDF</button></div>`;
  function showUnit(u, { scroll = true } = {}) {
    currentUnit = u;
    const out = $("#unitOut");
    out.hidden = false;
    out.innerHTML = unitBar + Render.unit(u, { editable: true });
    if (scroll) out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  uf.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validUnit()) return;
    const u = readUnit();
    u.sequence = Demo.sequence(u);
    saveBuilt(u);
    Api.track("unit_created", { via: "rules", inputs: unitInputs(u) });
    toast("Unit plan built and saved");
  });

  $("#aiSequenceBtn").addEventListener("click", async (e) => {
    if (!validUnit()) return;
    const btn = e.currentTarget;
    const u = readUnit();
    busy(btn, true, "Drafting unit plan…");
    try {
      const { sequence, sections } = await Api.draftSequence(unitInputs(u));
      u.sequence = Array.isArray(sequence) && sequence.length ? sequence : Demo.sequence(u);
      // AI drafts only fill what the teacher left blank.
      for (const [k, v] of Object.entries(sections || {})) {
        const blank = Array.isArray(u[k]) ? !u[k].length : !u[k];
        if (blank && (LIST_FIELDS.includes(k) || TEXT_FIELDS.includes(k))) u[k] = v;
      }
      saveBuilt(u);
      Api.track("unit_created", { via: "ai", inputs: unitInputs(u) });
      toast("Unit plan drafted and saved");
    } catch (err) {
      toast(err.code === "blocked" ? `Request blocked by safety guardrails: ${err.message}` : err.message, true);
    } finally { busy(btn, false); }
  });

  uf.addEventListener("reset", () => setTimeout(() => { uf.date.value = today(); updateRatio(); setEditing(null); }));
  $("#newUnitBtn").addEventListener("click", () => { uf.reset(); $("#unitOut").hidden = true; currentUnit = null; window.scrollTo({ top: 0 }); });

  // e.g. "Grade 1" → G1, "KG2" → KG2
  const gradeCode = (g) => (/^grade\s*(\d+)/i.test(g) ? `G${g.match(/\d+/)[0]}` : String(g || "").replace(/\s+/g, "").toUpperCase());
  function autoCodes(u) {
    const prefix = [gradeCode(u.grade), u.unitNo && `U${u.unitNo}`].filter(Boolean).join("-");
    let n = 0;
    u.sequence.forEach((s, i) => { if (!s.code) { s.code = `${prefix}-L${String(i + 1).padStart(2, "0")}`; n++; } });
    return n;
  }

  // Inline edits to the timeline and the reflection, plus per-lesson buttons
  $("#unitOut").addEventListener("focusout", (e) => {
    if (!currentUnit) return;
    const cell = e.target.closest("[data-idx]");
    const field = e.target.closest("[data-unit-field]");
    if (cell) currentUnit.sequence[+cell.dataset.idx][cell.dataset.field] = cell.textContent.trim();
    else if (field) currentUnit[field.dataset.unitField] = field.innerText.trim();
    else return;
    Store.upsertUnit(currentUnit);
  });
  $("#unitOut").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "print-unit") printDoc(Render.unit(currentUnit), currentUnit.title, { landscape: true });
    if (b.dataset.act === "edit-unit") { fillForm(currentUnit); setEditing(currentUnit); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (b.dataset.act === "auto-codes") {
      const n = autoCodes(currentUnit);
      Store.upsertUnit(currentUnit); showUnit(currentUnit, { scroll: false });
      toast(n ? `Assigned ${n} lesson code${n > 1 ? "s" : ""}` : "Every lesson already has a code");
    }
    if (b.dataset.openLesson) { showTab("lesson"); showLesson(Store.getLesson(b.dataset.openLesson)); }
    if (b.dataset.genLesson) {
      const s = currentUnit.sequence[+b.dataset.genLesson];
      showTab("lesson");
      setMode("unit");
      $("#lessonUnitSel").value = currentUnit.id;
      fillWeekClass();
      $("#lessonWeekSel").value = s.week; fillClass();
      $("#lessonClassSel").value = s.cls; fillFocus();
      $("#lessonForm").requestSubmit();
    }
  });

  // ───────── lesson builder ─────────
  let mode = "unit";
  function setMode(m) {
    mode = m;
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    $("#modeUnit").hidden = m !== "unit";
    $("#modePrompt").hidden = m !== "prompt";
  }
  $$(".seg-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  function refreshLessonUnitSelect() {
    const units = Store.units();
    const sel = $("#lessonUnitSel");
    const prev = sel.value;
    sel.innerHTML = units.length ? units.map((u) => `<option value="${u.id}">${esc(u.title)} (${esc(u.grade)})</option>`).join("")
      : `<option value="">No units yet — build one first</option>`;
    if (units.some((u) => u.id === prev)) sel.value = prev;
    fillWeekClass();
    if (!units.length) setMode("prompt");
  }
  const selUnit = () => Store.getUnit($("#lessonUnitSel").value);
  function fillWeekClass() {
    const u = selUnit();
    $("#lessonWeekSel").innerHTML = u ? Array.from({ length: u.weeks }, (_, i) => `<option value="${i + 1}">Week ${i + 1}</option>`).join("") : "";
    fillClass();
  }
  function fillClass() {
    const u = selUnit();
    $("#lessonClassSel").innerHTML = u ? Array.from({ length: u.classesPerWeek }, (_, i) => `<option value="${i + 1}">Class ${i + 1}</option>`).join("") : "";
    fillFocus();
  }
  function seqEntry() {
    const u = selUnit(); if (!u) return null;
    const w = +$("#lessonWeekSel").value, c = +$("#lessonClassSel").value;
    return u.sequence.find((s) => s.week === w && s.cls === c) || null;
  }
  function fillFocus() { const s = seqEntry(); $("#lessonFocus").value = s ? s.focus : ""; }
  $("#lessonUnitSel").addEventListener("change", fillWeekClass);
  $("#lessonWeekSel").addEventListener("change", fillClass);
  $("#lessonClassSel").addEventListener("change", fillFocus);

  let currentLesson = null;
  function showLesson(l) {
    if (!l) return;
    currentLesson = l;
    const out = $("#lessonOut");
    out.hidden = false;
    out.innerHTML = `<div class="out-bar"><button class="btn" data-act="print-lesson">Print / PDF</button></div>${Render.lesson(l)}`;
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#lessonOut").addEventListener("click", (e) => {
    if (e.target.closest("[data-act=print-lesson]")) printDoc(Render.lesson(currentLesson), currentLesson.title);
  });

  $("#lessonForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#genLessonBtn");
    let req;
    if (mode === "unit") {
      const u = selUnit();
      if (!u) return toast("Build a unit plan first, or switch to Direct prompt.", true);
      const s = seqEntry();
      // The lesson's whole timeline column, plus its neighbours for continuity.
      const i = s ? u.sequence.indexOf(s) : -1;
      const brief = (x) => x && [x.name, x.focus, x.outcome].filter(Boolean).join(" — ");
      req = {
        mode: "unit", unit: unitInputs(u),
        week: +$("#lessonWeekSel").value, cls: +$("#lessonClassSel").value,
        focus: $("#lessonFocus").value.trim(), outcome: s?.outcome || "",
        plan: s ? { code: s.code, name: s.name, los: s.los, keyConcept: s.keyConcept, lp: s.lp, atl: s.atl, assessment: s.assessment } : {},
        prev: brief(u.sequence[i - 1]) || "", next: (i >= 0 && brief(u.sequence[i + 1])) || "",
        minutes: u.minutesPerClass,
      };
    } else {
      const prompt = $("#lessonPrompt").value.trim();
      if (prompt.length < 10) return toast("Describe the lesson in a sentence or two.", true);
      const [boys, girls] = $("#promptMix").value.split("/").map((x) => parseInt(x, 10) || 0);
      req = { mode: "prompt", prompt, grade: $("#promptGrade").value, minutes: +$("#promptMinutes").value || 40, boys, girls };
    }
    req.extra = $("#lessonExtra").value.trim();
    req.useRag = $("#useRag").checked;

    busy(btn, true, "Generating…");
    try {
      const { lesson } = await Api.generateLesson(req);
      lesson.id = Store.uid();
      lesson.created = new Date().toISOString();
      if (req.mode === "unit") {
        const u = selUnit();
        Object.assign(lesson, { unitId: u.id, week: req.week, cls: req.cls });
        const s = u.sequence.find((x) => x.week === req.week && x.cls === req.cls);
        if (s) { s.lessonId = lesson.id; Store.upsertUnit(u); if (currentUnit?.id === u.id) showUnitQuiet(u); }
      }
      Store.upsertLesson(lesson);
      showLesson(lesson);
      toast("Lesson plan generated and saved");
    } catch (err) {
      toast(err.code === "blocked" ? `Request blocked by safety guardrails: ${err.message}` : err.message, true);
    } finally { busy(btn, false); }
  });
  function showUnitQuiet(u) { currentUnit = u; $("#unitOut").innerHTML = unitBar + Render.unit(u, { editable: true }); }

  // ───────── library ─────────
  function renderLibrary() {
    const units = Store.units(), lessons = Store.lessons();
    const d = (iso) => new Date(iso).toLocaleDateString();
    $("#libUnits").innerHTML = units.length ? units.map((u) => `<div class="lib-item">
      <div><b>${esc(u.title)}</b><br><small>${esc(u.grade)}${u.unitNo ? ` · Unit ${esc(u.unitNo)}` : ""} · ${u.weeks}w × ${u.classesPerWeek} · ${d(u.created)}</small></div>
      <div class="actions" style="margin:0"><button class="btn sm" data-open-unit="${u.id}">Open</button>
      <button class="btn sm" data-print-unit="${u.id}">Print</button><button class="btn sm ghost" data-del-unit="${u.id}">Delete</button></div></div>`).join("")
      : `<p class="empty">No unit plans yet.</p>`;
    $("#libLessons").innerHTML = lessons.length ? lessons.map((l) => `<div class="lib-item">
      <div><b>${esc(l.title)}</b><br><small>${esc(l.grade)} · ${esc(l.duration_min)} min · ${d(l.created)}</small></div>
      <div class="actions" style="margin:0"><button class="btn sm" data-open-lesson="${l.id}">Open</button>
      <button class="btn sm" data-print-lesson="${l.id}">Print</button><button class="btn sm ghost" data-del-lesson="${l.id}">Delete</button></div></div>`).join("")
      : `<p class="empty">No lesson plans yet.</p>`;
  }
  $("#tab-library").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const ds = b.dataset;
    if (ds.openUnit) { showTab("unit"); showUnit(Store.getUnit(ds.openUnit)); }
    if (ds.printUnit) { const u = Store.getUnit(ds.printUnit); printDoc(Render.unit(u), u.title, { landscape: true }); }
    if (ds.delUnit && confirm("Delete this unit plan?")) { Store.deleteUnit(ds.delUnit); renderLibrary(); }
    if (ds.openLesson) { showTab("lesson"); showLesson(Store.getLesson(ds.openLesson)); }
    if (ds.printLesson) { const l = Store.getLesson(ds.printLesson); printDoc(Render.lesson(l), l.title); }
    if (ds.delLesson && confirm("Delete this lesson plan?")) { Store.deleteLesson(ds.delLesson); renderLibrary(); }
  });
  $("#exportBtn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([Store.exportAll()], { type: "application/json" }));
    a.download = `pspe-plans-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $("#importInput").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { Store.importAll(await f.text()); renderLibrary(); toast("Imported"); } catch (_) { toast("That file isn't a valid export.", true); }
    e.target.value = "";
  });

  // ───────── print with watermark ─────────
  // Unit plans print A4 landscape, lesson plans portrait.
  function printDoc(html, title, { landscape = false } = {}) {
    $("#printPage").textContent = `@page { size: A4 ${landscape ? "landscape" : "portrait"}; }`;
    $("#printWm").src = C.WATERMARK_URL;
    $("#printWm").style.opacity = C.WATERMARK_OPACITY;
    $("#printLogo").src = C.WATERMARK_URL;
    $("#printCompany").textContent = C.COMPANY_NAME;
    $("#printDate").textContent = new Date().toLocaleDateString();
    $("#printFoot").textContent = C.FOOTER_TEXT;
    $("#printBody").innerHTML = html;
    const prevTitle = document.title;
    document.title = (title || C.PRODUCT_NAME).replace(/[\\/:*?"<>|]/g, "-"); // becomes the PDF filename
    const done = () => { document.title = prevTitle; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    // wait for the watermark image before opening the print dialog
    const img = $("#printWm");
    if (img.complete) window.print(); else { img.onload = img.onerror = () => window.print(); }
  }

  uf.date.value = today();
  updateRatio();
  setMode("unit");
  refreshLessonUnitSelect();
})();
