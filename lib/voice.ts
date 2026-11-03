import type { DB } from "./store";
import {
  PALETTE,
  addEvent,
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
import { addDays, dayOfWeek, todayISO } from "./time";

export type Intent =
  | { kind: "task"; title: string }
  | { kind: "note"; text: string }
  | { kind: "expense"; amount: number; item: string }
  | { kind: "attendance"; course: string; status: "ATTENDED" | "ABSENT" | "CANCELLED"; time?: string | null; date?: string }
  | { kind: "event"; title: string; date: string; time: string | null }
  | { kind: "unknown" };

export const NOT_UNDERSTOOD = "Didn't get that, could you please repeat";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const LEAD = /^(?:(?:hey|ok|okay|please|can you|could you|i want to|i need to|add|create|new|put|set|make|to|that|for|about|on|in|up|list|reminder|remind me|remember)\s+)+/i;
const TRAIL = /\s+(?:to|on|in|into|my|the|as|for|a|an)(?:\s+(?:my|the|a|an|list|tasks?|to-?dos?|notes?|calendar|schedule))*$/i;

const tidy = (t: string) =>
  t.replace(/\s+/g, " ").replace(/^[\s:,.-]+/, "").replace(LEAD, "").replace(/[.!?,:;\s]+$/, "").replace(TRAIL, "").replace(/[.!?,:;\s]+$/, "").trim();

/** Words after the keyword if there are any, else the words before it. */
function around(s: string, m: RegExpMatchArray): string {
  const i = m.index ?? 0;
  return tidy(s.slice(i + m[0].length)) || tidy(s.slice(0, i));
}

const SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const NUMWORD = new RegExp(
  `\\b(?:${[...SMALL, ...TENS.slice(2), "hundred", "thousand"].join("|")})(?:[\\s-]+(?:and\\s+)?(?:${[...SMALL, ...TENS.slice(2), "hundred", "thousand"].join("|")}))*\\b`,
  "gi",
);

/** "two hundred and fifty" -> "250"; "240 pm" -> "2:40 pm". Runs of number words only; other digits pass through. */
export function numberWords(s: string): string {
  return s.replace(NUMWORD, (run) => {
    let total = 0, cur = 0;
    for (const w of run.toLowerCase().split(/[\s-]+/)) {
      if (w === "and") continue;
      if (w === "hundred") cur = (cur || 1) * 100;
      else if (w === "thousand") { total += (cur || 1) * 1000; cur = 0; }
      else if (SMALL.includes(w)) cur += SMALL.indexOf(w);
      else cur += TENS.indexOf(w) * 10;
    }
    return String(total + cur);
  }).replace(/\b(\d{1,2})(\d{2})\s*([ap])\.?m\b/gi, "$1:$2 $3m");
}

/** Pulls a day word ("tomorrow", "friday") out of s. */
function dayWord(s: string, today: string): { date: string; rest: string } {
  const day = s.match(/\b(today|tomorrow|day after tomorrow|(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i);
  if (!day) return { date: today, rest: s };
  const w = day[1].toLowerCase();
  let date = today;
  if (w === "tomorrow") date = addDays(today, 1);
  else if (w === "day after tomorrow") date = addDays(today, 2);
  else if (w !== "today") {
    const diff = (WEEKDAYS.indexOf(day[2].toLowerCase()) - dayOfWeek(today) + 7) % 7;
    date = addDays(today, diff || 7);
  }
  return { date, rest: s.replace(day[0], " ") };
}

/** Pulls a clock time out of s as HH:MM. A bare "at 5" is assumed to be afternoon. */
function clockTime(s: string): { time: string | null; rest: string } {
  const t =
    s.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?(?=\W|$)/i) ??
    s.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})()(?=\W|$)/i) ??
    s.match(/\bat\s+(\d{1,2})(?::(\d{2}))?()(?=\W|$)/i);
  if (!t) return { time: null, rest: s };
  let h = Number(t[1]);
  const ap = t[3]?.toLowerCase();
  if (ap === "p") h = (h % 12) + 12;
  else if (ap === "a") h = h % 12;
  else if (h < 8) h += 12;
  return { time: `${String(h).padStart(2, "0")}:${t[2] ?? "00"}`, rest: s.replace(t[0], " ") };
}

/**
 * Keyword spotting, not grammar: the recognizer often mangles the verb
 * ("at task"), so we look for the noun and take the rest as the content.
 * shortcut: "five thirty" style clock times aren't parsed, say "5:30" or "five pm".
 */
export function parseCommand(raw: string, today = todayISO()): Intent {
  const s = numberWords(raw.trim().replace(/\s+/g, " "));
  let m: RegExpMatchArray | null;

  if (/\bcancel(?:l?ed)?\b/i.test(s)) {
    const d = dayWord(s, today);
    const c = clockTime(d.rest);
    const course = tidy(c.rest.replace(/\b(?:cancel(?:l?ed)?|class|classes|lecture|session|the|my|at|for|of)\b/gi, " "));
    if (course || c.time) return { kind: "attendance", course, status: "CANCELLED", time: c.time, date: d.date };
  }

  if ((m = s.match(/\b(present|absent|attended|attending)\b/i))) {
    const course = tidy(
      s.replace(m[0], " ").replace(/\b(?:mark|marked|as|i was|i am|i'm|was|class|lecture|today)\b/gi, " "),
    );
    if (course) return { kind: "attendance", course, status: /^absent/i.test(m[1]) ? "ABSENT" : "ATTENDED" };
  }

  const num = s.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (
    num &&
    (/\b(spen[dt]|spending|expenses?|expenditure|paid|bought|cost)\b/i.test(s) ||
      /^\D{0,6}\d[\d,.]*\s*(?:rupees|rs|dollars|bucks)?\s+(?:on|for)\b/i.test(s))
  ) {
    const amount = parseAmount(num[1]);
    if (amount) {
      const i = num.index ?? 0;
      const clean = (t: string) =>
        tidy(t.replace(/[₹$]/g, " ").replace(/\b(?:i\s+)?(?:spen[dt]|spending|expenses?|expenditure|paid|bought|cost|of|rupees|rs|dollars|bucks)\b/gi, " "));
      const item = clean(s.slice(i + num[0].length)) || clean(s.slice(0, i));
      return { kind: "expense", amount, item: item || "Voice entry" };
    }
  }

  if (/\b(schedule|calendar|events?|meeting|appointment)\b/i.test(s)) {
    const d = dayWord(s, today);
    const c = clockTime(d.rest);
    const { date } = d;
    const { time, rest } = c;
    const kw = rest.match(/\b(?:schedule|calendar|events?|appointment)\b/i);
    const title = kw ? around(rest, kw) : tidy(rest);
    return { kind: "event", title: title || "Event", date, time };
  }

  const note = s.match(/\bnotes?\b|\b(?:jot|write) down\b/i);
  const task = s.match(/\b(?:tasks?|to-?dos?|remind(?:er)?s?(?:\s+me)?|remember)\b/i);
  const hit = note && task ? ((note.index ?? 0) < (task.index ?? 0) ? note : task) : (note ?? task);
  if (hit) {
    const text = around(s, hit);
    if (text) return hit === note ? { kind: "note", text } : { kind: "task", title: text };
  }

  return { kind: "unknown" };
}

export function describe(i: Intent): string {
  switch (i.kind) {
    case "task": return `Added task “${i.title}”`;
    case "note": return `Saved note “${i.text}”`;
    case "expense": return `Logged ${(i.amount / 100).toFixed(2)} for “${i.item}”`;
    case "attendance": {
      const what = [i.course, i.time && `${i.time} class`].filter(Boolean).join(" ");
      const when = !i.date || i.date === todayISO() ? "today" : i.date;
      return i.status === "CANCELLED"
        ? `Cancelled ${what || "class"} ${when}`
        : `Marked ${what} ${i.status === "ATTENDED" ? "present" : "absent"} ${when}`;
    }
    case "event": return `Scheduled “${i.title}” ${i.date === todayISO() ? "today" : i.date}${i.time ? ` at ${i.time}` : ""}`;
    default: return NOT_UNDERSTOOD;
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
    case "event":
      addEvent(db, { date: i.date, title: i.title, startTime: i.time ?? undefined, color: PALETTE[0] });
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
      const date = i.date ?? today;
      let slots = getSlotsForDay(db, dayOfWeek(date));
      let course = null;
      if (i.course) {
        const q = i.course.toLowerCase();
        const words = q.split(/\s+/).filter((w) => w.length > 2);
        const courses = getCourses(db);
        course =
          courses.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())) ??
          courses.find((c) => words.some((w) => c.name.toLowerCase().includes(w))) ??
          null;
        if (!course) return `No course matching “${i.course}”.`;
        slots = slots.filter((s) => s.course_id === course!.id);
      }
      if (i.time) slots = slots.filter((s) => s.start_time.slice(0, 5) === i.time);
      const slot = slots[0];
      if (!slot) return `No ${course ? course.name : ""} class${i.time ? ` at ${i.time}` : ""} ${date === today ? "today" : "on " + date}.`.replace("No  ", "No ");
      markAttendance(db, { courseId: slot.course_id, date, startTime: slot.start_time, endTime: slot.end_time }, i.status);
      return null;
    }
    default:
      return NOT_UNDERSTOOD;
  }
}
