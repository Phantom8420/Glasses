// Run: NEXT_PUBLIC_GEMINI_KEY=... npx tsx scripts/llm-check.ts  (live call, needs network)
import { understand } from "../lib/llm";

const ctx = { today: "2026-11-03", weekday: "Tuesday", courses: ["Mathematics", "Physics"] };
(async () => {
  for (const t of ["at task buy milk and I was absent for physics", "put dentist on my calendar friday at five and I spent two fifty on lunch"]) {
    console.log(t, "=>", JSON.stringify(await understand(t, ctx)));
  }
})();
