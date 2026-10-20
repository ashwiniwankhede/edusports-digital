// ─────────────────────────────────────────────────────────────
//  Site configuration — edit these values, commit, done.
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  // URL of your deployed Cloudflare Worker (see README → Step 2).
  // Leave empty ("") to run in DEMO MODE: the UI works fully, but
  // lesson plans are generated from a local template instead of AI.
  API_BASE: "https://pspe-planner-api.ashwiniwankhede.workers.dev",

  // Branding used on screen and on every printed page.
  COMPANY_NAME: "Sportz Village",
  PRODUCT_NAME: "EduSports Digital",
  LOGO_URL: "assets/sv-wordmark.png",    // sidebar logo (wide wordmark)
  WATERMARK_URL: "assets/edusports-logo.png", // print header + watermark (SVG/PNG, transparent bg)
  WATERMARK_OPACITY: 0.07,               // 0.04 – 0.12 reads well on paper
  FOOTER_TEXT: "© Sportz Village",
};
