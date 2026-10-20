// Sidebar shell shared by index.html and admin.html: desktop collapse (remembered
// per browser) and the off-canvas menu on small screens.
(() => {
  const body = document.body;
  const KEY = "pspe_sb_collapsed";
  try { if (localStorage.getItem(KEY) === "1") body.classList.add("sb-collapsed"); } catch (_) {}

  document.getElementById("sbCollapse")?.addEventListener("click", () => {
    const on = body.classList.toggle("sb-collapsed");
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {}
  });

  const close = () => body.classList.remove("sb-open");
  document.getElementById("menuBtn")?.addEventListener("click", () => body.classList.add("sb-open"));
  document.getElementById("sbScrim")?.addEventListener("click", close);
  document.querySelectorAll(".sb-nav .tab").forEach((t) => t.addEventListener("click", close));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
