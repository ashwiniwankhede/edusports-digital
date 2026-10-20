// ─────────────────────────────────────────────────────────────────────────────
//  CHILD-SAFETY GUARDRAILS — edit this file to tighten or extend the policy.
//
//  Three layers run on every AI request (see guardrails.js):
//   1. Rule filter  — the patterns below, on the teacher's input AND the AI output.
//   2. AI classifier — a second model call judging the request against POLICY
//      (on when GUARDRAIL_LLM_CHECK = "true"; catches what patterns miss).
//   3. Policy in the system prompt — SAFEGUARDING_RULES are given to the
//      generator, and every lesson must carry a safeguarding section.
//
//  Patterns are deliberately generic. Add organisation-specific ones as you
//  learn from the "blocked" log in the admin dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export const BLOCK_RULES = [
  {
    id: "sexual_content",
    message: "Sexual or sexualised content is never appropriate in a children's PE plan.",
    pattern: String.raw`\b(sexual\w*|sexy|nude|nudity|naked|porn\w*|erotic\w*|seduc\w*|fondl\w*|lingerie|strip\s?tease)\b`,
  },
  {
    id: "secrecy_or_private_contact",
    message: "Plans must not involve secrets with children or private adult–child contact channels.",
    pattern: String.raw`(keep\s+(it|this)?\s*(a\s+)?secret|our\s+(little\s+)?secret|don'?t\s+tell\s+(your\s+)?(parents?|mum|mom|dad|teachers?|anyone)|(personal|private)\s+(phone|number|chat|whatsapp|instagram|snapchat|social\s+media)\s+(with|to|for)\s+(the\s+)?(child|children|student|students|pupils?|kids?))`,
  },
  {
    id: "isolation",
    message: "Activities must not isolate a child with an adult out of sight of others.",
    pattern: String.raw`\b(alone\s+with\s+(a|the|one)?\s*(child|student|pupil|kid)|(out\s+of\s+sight|behind\s+closed\s+doors|locked\s+room)\b.{0,40}\b(child|student|pupil|kid)s?)`,
  },
  {
    id: "inappropriate_contact_or_imagery",
    message: "Plans must not include inappropriate touching or images of children in changing/private areas.",
    pattern: String.raw`((photo\w*|film\w*|video\w*|record\w*|camera)\b.{0,40}\b(changing\s+room|undress\w*|shower\w*|toilet|bathroom|locker\s+room)|(changing\s+room|undress\w*|shower\w*)\b.{0,40}\b(photo\w*|film\w*|video\w*|record\w*|camera)|(massage|rub|touch)\w*\b.{0,25}\b(thigh|chest|bottom|buttock|groin|private\s+parts?))`,
  },
  {
    id: "abuse_or_punishment",
    message: "Physical punishment, humiliation, or exercise used as punishment is not permitted.",
    pattern: String.raw`\b((hit|slap|smack|beat|spank|kick|shove)\w*\s+(the\s+)?(child|children|student|students|pupils?|kids?)|(punish\w*|humiliat\w*|shame|ridicul\w*)\b.{0,40}\b(child|children|student|students|pupils?|kids?|laps|push[- ]?ups|burpees|running)|(laps|push[- ]?ups|burpees|running)\b.{0,25}\bas\s+(a\s+)?punishment)`,
  },
];

// Personal data is redacted before anything is sent to the AI or stored in analytics.
export const REDACT_RULES = [
  { id: "email", pattern: String.raw`[\w.+-]+@[\w-]+\.[\w.-]+`, replace: "[email removed]" },
  { id: "phone", pattern: String.raw`\+?\d[\d\s().-]{7,}\d`, replace: "[phone removed]" },
];

// Policy text shared by the generator system prompt and the AI classifier.
export const SAFEGUARDING_RULES = [
  "Content is for children aged roughly 3–12. Keep all language, examples and themes age-appropriate.",
  "Never produce sexual, sexualised, violent, or humiliating content, or anything that could facilitate grooming or abuse.",
  "Adults must never be alone with a child out of sight of others; any 1:1 support happens in view of the group.",
  "Physical contact by adults is limited to what is necessary for safety (e.g. gymnastics spotting), is explained to the child first, and happens in full view.",
  "Never use exercise, exclusion, or public comparison as punishment. No body-shaming, public weighing, or comments on body size.",
  "No photos or video of children unless for assessment under school policy; never in changing areas.",
  "Grouping must be inclusive and follow the class profile and school policy the teacher gives; respect cultural and religious dress and modesty requirements.",
  "Include hydration, heat and medical-condition checks appropriate to the setting.",
  "If a teacher's request conflicts with these rules, refuse that part and explain briefly.",
];
