import type { DB } from "./store";
import {
  addNote,
  addTask,
  addTransaction,
  getAccounts,
  getCategories,
  getCourses,
  getSlotsForDay,
  markAttendance,
} from "./store";
import { parseAmount } from "./money";
import { dayOfWeek, todayISO } from "./time";

export type Intent =
  | { kind: "task"; title: string }
  | { kind: "note"; text: string }
  | { kind: "expense"; amount: number; item: string }
  | { kind: "attendance"; course: string; status: "ATTENDED" | "ABSENT" }
  | { kind: "unknown" };

/** Rule-based: a handful of phrasings per action, no network, no model. */
export function parseCommand(raw: string): Intent {
  // Drop filler the recognizer faithfully transcribes.
  const s = raw
    .trim()
    .replace(/[.!?,]+$/, "")
    .replace(/^(?:(?:hey|ok|okay|please|can you|could you|would you|i want to|i wanna|i need to|i have to|i should)\s+)+/i, "");
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|in)\s+(?:my\s+)?(?:tasks?|to-?do(?:s| list)?|list)$/i)))
    return { kind: "task", title: m[1] };
  if ((m = s.match(/^(?:remember|don'?t forget)\s+(?:to\s+)?(.+)$/i))) return { kind: "task", title: m[1] };

  if ((m = s.match(/^(?:add|create|new)\s+(?:a\s+)?(?:task|todo|to-do|reminder)\s*(?:to|:)?\s+(.+)$/i)))
    return { kind: "task", title: m[1] };
  if ((m = s.match(/^remind me to\s+(.+)$/i))) return { kind: "task", title: m[1] };

  if ((m = s.match(/^(?:note|add (?:a )?note|jot down|write down)\s*[:,]?\s+(.+)$/i)))
    return { kind: "note", text: m[1] };

  if ((m = s.match(/^(?:i\s+)?(?:spent|paid|bought)\s+(?:rs\.?|₹|\$)?\s*([\d,]+(?:\.\d+)?)\s*(?:rupees|rs|dollars|bucks)?\s*(?:on|for)?\s*(.*)$/i))) {
    const amount = parseAmount(m[1]);
    if (amount) return { kind: "expense", amount, item: m[2].trim() || "Voice entry" };
  }

  if ((m = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:rupees|rs|dollars|bucks)?\s+(?:on|for)\s+(.+)$/i))) {
    const amount = parseAmount(m[1]);
    if (amount) return { kind: "expense", amount, item: m[2].trim() };
  }

  if ((m = s.match(/^(?:mark\s+)?(.+?)\s+(present|attended|absent)$/i)))
    return {
      kind: "attendance",
      course: m[1].replace(/^mark\s+/i, ""),
      status: /absent/i.test(m[2]) ? "ABSENT" : "ATTENDED",
    };

  return { kind: "unknown" };
}

export function describe(i: Intent): string {
  switch (i.kind) {
    case "task": return `Add task “${i.title}”`;
    case "note": return `Save note “${i.text}”`;
    case "expense": return `Log expense ${(i.amount / 100).toFixed(2)} for “${i.item}”`;
    case "attendance": return `Mark ${i.course} ${i.status === "ATTENDED" ? "present" : "absent"} today`;
    default: return "";
  }
}

/** Runs inside mutate(). Returns an error string, or null on success. */
export function runIntent(db: DB, i: Intent): string | null {
  const today = todayISO();
  switch (i.kind) {
    case "task":
      addTask(db, { title: i.title });
      return null;
    case "note":
      addNote(db, { text: i.text });
      return null;
    case "expense": {
      const account = getAccounts(db)[0];
      const cat = getCategories(db, "EXPENSE")[0];
      if (!account || !cat) return "Set up an account and an expense category in Money first.";
      addTransaction(db, {
        date: today, kind: "EXPENSE", amount: i.amount,
        accountId: account.id, categoryId: cat.id, item: i.item,
      });
      return null;
    }
    case "attendance": {
      const q = i.course.toLowerCase();
      const course = getCourses(db).find((c) => c.name.toLowerCase().includes(q));
      if (!course) return `No course matching “${i.course}”.`;
      const slot = getSlotsForDay(db, dayOfWeek(today)).find((s) => s.course_id === course.id);
      if (!slot) return `${course.name} has no class today.`;
      markAttendance(db, { courseId: course.id, date: today, startTime: slot.start_time, endTime: slot.end_time }, i.status);
      return null;
    }
    default:
      return "Didn't catch a command.";
  }
}
