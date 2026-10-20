// Local persistence (browser only — no login, nothing personal leaves the device
// except the anonymous analytics events described in README).
window.Store = (() => {
  const KEY = "pspe_planner_v1";
  let mem = { units: [], lessons: [] };

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw); } catch (_) {}
    mem.units ||= []; mem.lessons ||= [];
    return mem;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) {} }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  load();
  return {
    uid,
    units: () => mem.units,
    lessons: () => mem.lessons,
    getUnit: (id) => mem.units.find((u) => u.id === id),
    getLesson: (id) => mem.lessons.find((l) => l.id === id),
    upsertUnit(u) { const i = mem.units.findIndex((x) => x.id === u.id); i >= 0 ? (mem.units[i] = u) : mem.units.unshift(u); save(); return u; },
    upsertLesson(l) { const i = mem.lessons.findIndex((x) => x.id === l.id); i >= 0 ? (mem.lessons[i] = l) : mem.lessons.unshift(l); save(); return l; },
    deleteUnit(id) { mem.units = mem.units.filter((u) => u.id !== id); save(); },
    deleteLesson(id) { mem.lessons = mem.lessons.filter((l) => l.id !== id); save(); },
    exportAll: () => JSON.stringify(mem, null, 2),
    importAll(json) {
      const data = JSON.parse(json);
      for (const u of data.units || []) if (!mem.units.some((x) => x.id === u.id)) mem.units.push(u);
      for (const l of data.lessons || []) if (!mem.lessons.some((x) => x.id === l.id)) mem.lessons.push(l);
      save();
    },
  };
})();
