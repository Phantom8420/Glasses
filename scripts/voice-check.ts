// Run: npx tsx scripts/voice-check.ts
import assert from "node:assert/strict";
import { parseCommand as p } from "../lib/voice";

const T = "2026-11-03"; // a Tuesday
assert.deepEqual(p("at task buy milk", T), { kind: "task", title: "buy milk" });
assert.deepEqual(p("add buy milk to my tasks", T), { kind: "task", title: "buy milk" });
assert.deepEqual(p("remind me to call mom", T), { kind: "task", title: "call mom" });
assert.deepEqual(p("note: the landlord called", T), { kind: "note", text: "the landlord called" });
assert.deepEqual(p("I spent 200 on lunch", T), { kind: "expense", amount: 20000, item: "lunch" });
assert.deepEqual(p("expenditure 50 for coffee", T), { kind: "expense", amount: 5000, item: "coffee" });
assert.deepEqual(p("mark maths present", T), { kind: "attendance", course: "maths", status: "ATTENDED" });
assert.deepEqual(p("I was absent for physics", T), { kind: "attendance", course: "physics", status: "ABSENT" });
assert.deepEqual(p("schedule dentist tomorrow at 5 pm", T), { kind: "event", title: "dentist", date: "2026-11-04", time: "17:00" });
assert.deepEqual(p("add event team meeting on friday at 10:30 am", T), { kind: "event", title: "team meeting", date: "2026-11-06", time: "10:30" });
assert.deepEqual(p("I spent two hundred and fifty on lunch", T), { kind: "expense", amount: 25000, item: "lunch" });
assert.deepEqual(p("spent one thousand five hundred for groceries", T), { kind: "expense", amount: 150000, item: "groceries" });
assert.deepEqual(p("schedule dentist tomorrow at five pm", T), { kind: "event", title: "dentist", date: "2026-11-04", time: "17:00" });
assert.deepEqual(p("add task call twenty one people", T), { kind: "task", title: "call 21 people" });
assert.deepEqual(p("cancel 240 pm class", T), { kind: "attendance", course: "", status: "CANCELLED", time: "14:40", date: T });
assert.deepEqual(p("cancel physics class tomorrow", T), { kind: "attendance", course: "physics", status: "CANCELLED", time: null, date: "2026-11-04" });
assert.equal(p("what's the weather", T).kind, "unknown");
assert.equal(p("", T).kind, "unknown");
console.log("voice parser ok");
