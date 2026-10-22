// Rule-based generators: the default class sequence for a unit, and a template
// lesson used in demo mode (no backend). The AI path replaces both.
window.Demo = (() => {
  // Generic inquiry arc for a PYP PE unit, mapped across the total number of classes: [name, focus].
  function stageFor(i, total) {
    if (i === 0) return ["Tuning in", "Diagnostic task & introduce the central idea"];
    if (i === total - 1) return ["Show and reflect", "Summative performance & reflection"];
    if (total > 3 && i === total - 2) return ["Rehearse", "Rehearse & peer feedback for the summative task"];
    const p = i / (total - 1);
    if (p < 0.3) return ["Finding out", "Explore & experiment"];
    if (p < 0.65) return ["Sorting out", "Develop & practise skills"];
    return ["Going further", "Apply in a game or composition"];
  }
  const FORMATIVE = ["Formative: teacher observation", "Formative: peer feedback", "Formative: exit reflection"];
  const pick = (arr, i) => (arr && arr.length ? arr[i % arr.length] : "");

  // Rule-based unit timeline. The AI path writes lesson-specific outcomes; rules can only
  // point each lesson at the unit outcome it covers (first and last lessons cover them all).
  function sequence(unit) {
    const total = unit.weeks * unit.classesPerWeek;
    const outcomes = unit.outcomes && unit.outcomes.length ? unit.outcomes : ["(add unit learning outcomes)"];
    const all = outcomes.map((_, n) => `LO${n + 1}`);
    const seq = [];
    let i = 0;
    for (let w = 1; w <= unit.weeks; w++) {
      for (let c = 1; c <= unit.classesPerWeek; c++, i++) {
        const [name, focus] = stageFor(i, total);
        const first = i === 0, last = i === total - 1;
        const n = (i - 1) % outcomes.length;
        seq.push({
          week: w, cls: c, code: "", name, focus,
          los: first || last ? all : [all[n]],
          outcome: first ? "Show what I can already do towards the unit outcomes"
            : last ? "Demonstrate the unit outcomes in the summative task" : outcomes[n],
          keyConcept: pick(unit.keyConcepts, i), lp: pick(unit.lp, i), atl: pick(unit.atl, i),
          assessment: first ? "Formative: diagnostic task" : last ? "Summative: performance task & reflection" : FORMATIVE[(i - 1) % 3],
        });
      }
    }
    return seq;
  }

  function split(minutes) {
    const warm = Math.max(5, Math.round(minutes * 0.15));
    const cool = Math.max(5, Math.round(minutes * 0.12));
    const skill = Math.round((minutes - warm - cool) * 0.45);
    const main = minutes - warm - cool - skill;
    return [warm, skill, main, cool];
  }

  function lesson(req) {
    const u = req.unit || {};
    const minutes = Number(req.minutes || u.minutesPerClass || 40);
    const [w, s, m, c] = split(minutes);
    const focus = req.focus || req.prompt || "Movement skills";
    const p = req.plan || {}; // the lesson's timeline column (unit mode)
    return {
      title: req.mode === "unit" ? p.name || `${u.title || "Unit"} — Week ${req.week}, Class ${req.cls}` : focus.slice(0, 80),
      lesson_code: p.code || "",
      grade: u.grade || req.grade || "",
      duration_min: minutes,
      unit_title: u.title || "",
      focus,
      learning_intentions: [req.outcome || `We are exploring: ${focus}`],
      success_criteria: ["I can describe what good technique looks like", "I can show it in practice", "I can give a peer one piece of useful feedback"],
      key_concepts: p.keyConcept ? [p.keyConcept] : u.keyConcepts || [],
      atl: p.atl ? [p.atl] : (u.atl || []).slice(0, 2),
      learner_profile: p.lp ? [p.lp] : (u.lp || []).slice(0, 2),
      equipment: u.facilities ? [u.facilities] : ["Cones", "Bean bags", "Hoops"],
      space_setup: "Mark a safe working area with cones, 2 m clear of walls and obstacles.",
      safety_and_safeguarding: [
        "Check the space and equipment before students enter.",
        "Teacher stays in a position to see every student at all times.",
        "Any physical support is minimal, explained first, and done in full view of the group.",
      ],
      phases: [
        { name: "Warm-up", minutes: w, activity: "Pulse raiser with movement prompts linked to today's focus.", organisation: "Whole class, free space", teaching_points: ["Look up, find space"], differentiation: { support: "Slower pace", extend: "Add direction changes" } },
        { name: "Skill development", minutes: s, activity: "Guided practice of the focus skill in pairs.", organisation: "Mixed pairs", teaching_points: ["Model, then practise", "One cue at a time"], differentiation: { support: "Larger target / closer distance", extend: "Add a time or accuracy challenge" } },
        { name: "Main activity", minutes: m, activity: "Small-sided game or task that applies the skill.", organisation: "Mixed groups of 4", teaching_points: ["Apply the cue under pressure"], differentiation: { support: "Fewer rules", extend: "Add a defender / constraint" } },
        { name: "Cool-down & reflection", minutes: c, activity: "Stretch, then think–pair–share against the success criteria.", organisation: "Circle", teaching_points: ["Link back to the central idea"], differentiation: { support: "Sentence starters", extend: "Set a personal next step" } },
      ],
      inquiry_questions: ["What helped you stay in control?", "How could you change the task to make it harder?"],
      assessment: { strategy: p.assessment || "Teacher observation against success criteria", evidence: "Checklist notes for 4–6 focus students" },
      teacher_notes: "Demo template — connect the AI backend for a fully tailored plan.",
      sources: [],
    };
  }

  return { sequence, lesson };
})();
