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
  // Formative checks use the 3-point scale (pedagogy v1.0 §8).
  const FORMATIVE = ["Formative: observation, Proficient / Developing / Needs Development", "Formative: peer feedback on the scale", "Formative: self-check against the goal"];
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
          assessment: first ? "Formative: diagnostic task" : last ? "Summative: match play, judged on skill, teamwork, effort" : FORMATIVE[(i - 1) % 3],
        });
      }
    }
    return seq;
  }

  // Default lesson (pedagogy v1.0 §6): 40 min = 3 / 6 / 10 / 14 / 7, movement 0 / 6 / 8 / 12 / 4,
  // scaled to the teacher's length and movement time. Same rule as lessonSplit() in the Worker.
  const SPLIT = [["Tuning in", 3, 0], ["Warm-up", 6, 6], ["Activity 1: skill development", 10, 8], ["Activity 2: applied game", 14, 12], ["Cool-down and reflection", 7, 4]];
  function split(total = 40, movement = 30) {
    total = Math.max(15, Math.round(total)); movement = Math.min(total, Math.max(0, Math.round(movement)));
    const fit = (base, sum, cap) => {
      const raw = base.map((b) => (b * sum) / base.reduce((a, c) => a + c, 0));
      const out = raw.map((r, i) => Math.min(cap ? cap[i] : Infinity, Math.floor(r)));
      let left = sum - out.reduce((a, c) => a + c, 0);
      const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
      for (let pass = 0; left > 0 && pass < 50; pass++) for (const i of order) if (left > 0 && (!cap || out[i] < cap[i]) && (base[i] > 0 || !cap)) { out[i]++; left--; }
      return out;
    };
    const minutes = fit(SPLIT.map((x) => x[1]), total);
    const moving = fit(SPLIT.map((x) => x[2]), movement, minutes);
    return SPLIT.map(([name], i) => ({ name, minutes: minutes[i], movement: moving[i] }));
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
    const sp = split(minutes, req.movementMinutes || u.movementMinutes || Math.round(minutes * 0.75));
    const focus = req.focus || req.prompt || "Movement skills";
    const p = req.plan || {}; // the lesson's timeline column (unit mode)
    const n = Math.min(30, (u.boys || req.boys || 0) + (u.girls || req.girls || 0)) || 24;
    const props = (u.props && u.props.length ? u.props : req.props) || [];
    const ph = (i, o) => ({ name: sp[i].name, minutes: sp[i].minutes, movement_minutes: sp[i].movement, ...o });
    return {
      title: req.mode === "unit" ? p.name || `${u.title || "Unit"} — Week ${req.week}, Class ${req.cls}` : focus.slice(0, 80),
      lesson_code: p.code || "",
      grade: u.grade || req.grade || "",
      duration_min: minutes,
      movement_min: sp.reduce((a, x) => a + x.movement, 0),
      unit_title: u.title || "",
      focus,
      outcome_skill: "Students will perform the focus skill with control.",
      outcome_physical: "Students will stay active through every movement phase.",
      outcome_cognitive: "Students will choose when to use the skill in a game.",
      outcome_life_skill: "Students will encourage a partner and take turns fairly.",
      ib_strands: ["Movement", "Interactions"],
      ib_outcomes: [],
      learning_intentions: [req.outcome || `We are exploring: ${focus}`],
      success_criteria: ["I can show good technique", "I can practise it with control", "I can give a peer useful feedback"],
      key_concepts: p.keyConcept ? [p.keyConcept] : u.keyConcepts || [],
      atl: p.atl ? [p.atl] : (u.atl || []).slice(0, 2),
      learner_profile: p.lp ? [p.lp] : (u.lp || []).slice(0, 2),
      equipment: props.length ? props : ["12 cones", "24 bean bags", "12 hoops"],
      space_setup: "Mark a safe working area with cones, 2 m clear of walls and obstacles. Put water and first aid by the door.",
      space_setup_points: ["Cone boundary 2 m from walls", "Water and first aid by the door"],
      space_diagram: D.setup,
      tuning_in_question: "What helps you move with control?",
      safety_and_safeguarding: ["Keep 2 m between working pairs", "Clear spare props from the floor"],
      phases: [
        ph(0, { setup: "Whole class seated in a circle near the teacher.", steps: ["Gather the class in a circle", "Share today's focus", "Ask the tuning-in question"],
          activity_points: ["Gather and share the focus", "Answer the tuning-in question"], teaching_points: ["Listen, then share one idea"], focus_area: "", differentiation: { support: "Picture prompt", extend: "Give an example" }, diagram: D.circle(n) }),
        ph(1, { setup: "Whole class, free space inside the cones.", steps: ["Travel in free space", "Change pathway on the signal", "Freeze and hold still", "Finish with stretches"],
          activity_points: ["Travel in free space", "Freeze and hold on the signal"], teaching_points: ["Look up, find space"], focus_area: "Safe spacing while travelling", differentiation: { support: "Slower pace", extend: "Add direction changes" }, diagram: D.warm(n) }),
        ph(2, { setup: "Pairs in two rows, 3 m apart, facing each other.", steps: ["Watch the demonstration", "Partner A tries, B gives one tip", "Swap roles every 5 tries"],
          activity_points: ["Practise the skill in pairs", "Give one tip, then swap"], teaching_points: ["Model, then practise", "One cue at a time"], focus_area: "Technique on the focus skill", differentiation: { support: "Closer distance", extend: "Add an accuracy challenge" }, diagram: D.pairs(n) }),
        ph(3, { setup: "4 stations, groups sized to the props; rotate clockwise.", steps: ["Play the station game", "Rotate on the signal", "Use the skill to score"],
          activity_points: ["4 stations, groups rotate", "Apply the skill in a game"], teaching_points: ["Apply the cue under pressure"], focus_area: "Everyone involved; skill under pressure", differentiation: { support: "Fewer rules", extend: "Add a defender" }, diagram: D.groups(n) }),
        ph(4, { setup: "Whole class in a circle.", steps: ["Slow stretches", "Think–pair–share on the criteria", "Set a goal for next time"],
          activity_points: ["Stretch in a circle", "Reflect on the criteria"], teaching_points: ["Breathe slowly"], focus_area: "", differentiation: { support: "Sentence starters", extend: "Set a personal next step" }, diagram: D.circle(n) }),
      ],
      reflection_skill: ["What helped you stay in control?"],
      reflection_cognitive: ["When did you choose to use the skill?"],
      reflection_life_skill: ["How did you help your partner?"],
      feedback_focus: "Control at the start of each movement",
      small_goal: "Five controlled tries in a row",
      assessment: { strategy: p.assessment || "Observe focus students: Proficient / Developing / Needs Development", evidence: "Checklist notes for 4–6 students" },
      teacher_notes: "Demo template — connect the AI backend for a fully tailored plan.",
      sources: [],
    };
  }

  return { sequence, lesson };
})();
