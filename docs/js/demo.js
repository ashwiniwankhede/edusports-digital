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

  // Template diagrams for a 20 × 12 m hall (same layout data the AI returns; drawn by diagram.js).
  const HALL = { w: 20, h: 12, label: "Indoor hall" };
  const it = (type, x, y, o = {}) => ({ type, x, y, w: 0, h: 0, n: 0, shape: "none", team: "", ...o });
  const corners = [[1.5, 1.5], [18.5, 1.5], [1.5, 10.5], [18.5, 10.5], [10, 1.5], [10, 10.5]].map(([x, y]) => it("cone", x, y));
  const D = {
    setup: { area: HALL, zones: [], arrows: [], items: [...corners, it("teacher", 10, 11), it("water", 1, 6), it("first_aid", 1, 7.5)] },
    warm: (n) => ({ area: HALL, zones: [], items: [...corners, it("group", 10, 6, { w: 15, h: 7, n, shape: "scatter" }), it("teacher", 10, 11)],
      arrows: [{ from_x: 5, from_y: 4, to_x: 8, to_y: 3, kind: "move" }, { from_x: 14, from_y: 8, to_x: 16, to_y: 6, kind: "move" }] }),
    pairs: (n) => ({ area: HALL, zones: [], arrows: [], items: [it("group", 10, 4, { w: 14, h: 2.5, n: Math.ceil(n / 2), shape: "pairs", team: "A" }),
      it("group", 10, 8, { w: 14, h: 2.5, n: Math.floor(n / 2), shape: "pairs", team: "B" }), it("teacher", 10, 11)] }),
    groups: (n) => ({ area: HALL, arrows: [{ from_x: 9.3, from_y: 3, to_x: 10.7, to_y: 3, kind: "rotate" }, { from_x: 10.7, from_y: 9, to_x: 9.3, to_y: 9, kind: "rotate" }],
      zones: [[1, 1, "1"], [11, 1, "2"], [11, 6.5, "3"], [1, 6.5, "4"]].map(([x, y, label]) => ({ x, y, w: 8, h: 4.5, label })),
      items: [["A", 5, 3.3], ["B", 15, 3.3], ["C", 15, 8.8], ["D", 5, 8.8]].map(([team, x, y]) => it("group", x, y, { w: 6, h: 2, n: Math.ceil(n / 4), shape: "scatter", team })).concat(it("teacher", 10, 6)) }),
    circle: (n) => ({ area: HALL, zones: [], arrows: [], items: [it("group", 10, 6, { w: 8, h: 8, n, shape: "circle" }), it("teacher", 10, 6)] }),
  };

  function lesson(req) {
    const u = req.unit || {};
    const minutes = Number(req.minutes || u.minutesPerClass || 40);
    const [w, s, m, c] = split(minutes);
    const focus = req.focus || req.prompt || "Movement skills";
    const p = req.plan || {}; // the lesson's timeline column (unit mode)
    const n = Math.min(30, (u.boys || req.boys || 0) + (u.girls || req.girls || 0)) || 24;
    return {
      title: req.mode === "unit" ? p.name || `${u.title || "Unit"} — Week ${req.week}, Class ${req.cls}` : focus.slice(0, 80),
      lesson_code: p.code || "",
      grade: u.grade || req.grade || "",
      duration_min: minutes,
      unit_title: u.title || "",
      focus,
      learning_intentions: [req.outcome || `We are exploring: ${focus}`],
      success_criteria: ["I can show good technique", "I can practise it with control", "I can give a peer useful feedback"],
      key_concepts: p.keyConcept ? [p.keyConcept] : u.keyConcepts || [],
      atl: p.atl ? [p.atl] : (u.atl || []).slice(0, 2),
      learner_profile: p.lp ? [p.lp] : (u.lp || []).slice(0, 2),
      equipment: u.facilities ? [u.facilities] : ["12 cones", "24 bean bags", "12 hoops"],
      space_setup: "Mark a safe working area with cones, 2 m clear of walls and obstacles. Put water and first aid by the door.",
      space_setup_points: ["Cone boundary 2 m from walls", "Water and first aid by the door"],
      space_diagram: D.setup,
      safety_and_safeguarding: ["Keep 2 m between working pairs", "Clear spare equipment from the floor"],
      phases: [
        { name: "Warm-up", minutes: w, activity: "Students travel in free space using movements linked to today's focus. On the signal they freeze and hold still.", organisation: "Whole class, free space inside the cones.",
          activity_points: ["Travel in free space", "Freeze and hold on the signal"], teaching_points: ["Look up, find space"], differentiation: { support: "Slower pace", extend: "Add direction changes" }, diagram: D.warm(n) },
        { name: "Skill development", minutes: s, activity: "In pairs, students practise the focus skill. One partner tries, the other gives one tip, then they swap.", organisation: "Pairs in two rows, facing each other.",
          activity_points: ["Practise the skill in pairs", "Give one tip, then swap"], teaching_points: ["Model, then practise", "One cue at a time"], differentiation: { support: "Larger target or closer distance", extend: "Add a time or accuracy challenge" }, diagram: D.pairs(n) },
        { name: "Main activity", minutes: m, activity: "Four groups rotate through stations that apply the skill in a game or task. Groups move on at the signal.", organisation: "4 stations; groups rotate clockwise.",
          activity_points: ["4 stations, groups rotate", "Apply the skill in a game"], teaching_points: ["Apply the cue under pressure"], differentiation: { support: "Fewer rules", extend: "Add a defender or constraint" }, diagram: D.groups(n) },
        { name: "Cool-down & reflection", minutes: c, activity: "Slow stretches in a circle, then think–pair–share against the success criteria.", organisation: "Whole class in a circle.",
          activity_points: ["Stretch in a circle", "Think–pair–share on the criteria"], teaching_points: ["Link back to the central idea"], differentiation: { support: "Sentence starters", extend: "Set a personal next step" }, diagram: D.circle(n) },
      ],
      inquiry_questions: ["What helped you stay in control?", "How could you make it harder?"],
      assessment: { strategy: p.assessment || "Observe focus students against the success criteria", evidence: "Checklist notes for 4–6 students" },
      teacher_notes: "Demo template — connect the AI backend for a fully tailored plan.",
      sources: [],
    };
  }

  return { sequence, lesson };
})();
