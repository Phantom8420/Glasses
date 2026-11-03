// Run: NEXT_PUBLIC_GEMINI_KEY=... npx tsx scripts/llm-check.ts  (live call, needs network)
import { understand } from "../lib/llm";

const ctx = { today: "2026-11-03", weekday: "Tuesday", courses: ["Mathematics", "Physics"], classes: ["2026-11-03 09:00 Mathematics", "2026-11-03 14:40 Physics"], tasks: ["buy milk"] };
(async () => {
  for (const t of ["cancel 240 pm class", "what classes do I have today", "at task buy milk and I was absent for physics", "put dentist on my calendar friday at five and I spent two fifty on lunch"]) {
    console.log(t, "=>", JSON.stringify(await understand(t, ctx)));
  }
})();
