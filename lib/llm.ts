import { numberWords, type Intent } from "./voice";

// shortcut: key is baked into the APK at build time (personal app); proxy it before sharing the app.
const KEY = process.env.NEXT_PUBLIC_GEMINI_KEY;
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

const ACTION = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["task", "note", "expense", "attendance", "event"] },
    title: { type: "STRING" },
    amount: { type: "NUMBER" },
    course: { type: "STRING" },
    status: { type: "STRING", enum: ["present", "absent", "cancelled"] },
    date: { type: "STRING" },
    time: { type: "STRING" },
  },
  required: ["kind"],
};
const SCHEMA = {
  type: "OBJECT",
  properties: { reply: { type: "STRING" }, actions: { type: "ARRAY", items: ACTION } },
  required: ["reply", "actions"],
};

type Raw = { kind: string; title?: string; amount?: number; course?: string; status?: string; date?: string; time?: string };

export type Understood = { reply: string; intents: Intent[] };

/** Turns a spoken sentence into a spoken reply plus actions. Returns null when Gemini is unreachable. */
export async function understand(
  text: string | { audio: string },
  ctx: { today: string; weekday: string; courses: string[]; classes: string[]; tasks: string[] },
): Promise<Understood | null> {
  if (!KEY) return null;
  const system =
    `You are the voice assistant of a personal organiser app. The user speaks; the input is either speech-to-text (often garbled) or a raw audio clip: listen to it; if it is silent or unintelligible, ask them to repeat and return no actions. Garbled examples ("at task" means "add task", "240 pm" means 2:40 pm). ` +
    `Reply in one short, friendly spoken sentence (no markdown, no emoji) and list the actions to perform. For questions, answer from the data below and return no actions; ` +
    `if asked something you can't do or don't know, say so briefly. Never claim an action is done unless you list it. ` +
    `Today is ${ctx.today} (${ctx.weekday}). Courses: ${ctx.courses.join(", ") || "none"}. ` +
    `Classes (date, start time, course): ${ctx.classes.join("; ") || "none"}. Open tasks: ${ctx.tasks.join("; ") || "none"}. ` +
    `Actions: task (title), note (title = the note text), expense (amount in major currency units, title = what it was for), ` +
    `attendance (course = exact name from the course list, or omit if only a time is given; status present|absent|cancelled; "cancel the class" = cancelled; time HH:MM 24h of that class and date YYYY-MM-DD, omit date for today; use the class list to resolve the time or course), ` +
    `event (title, date YYYY-MM-DD resolved from words like "friday" or "tomorrow" to the next such date, time HH:MM 24h or omit; "five" with no am/pm means 17:00). ` +
    `One utterance may hold several actions. Keep titles short, in the speaker's words.`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ parts: [typeof text === "string" ? { text: numberWords(text) } : { inlineData: { mimeType: "audio/wav", data: text.audio } }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body,
        signal: AbortSignal.timeout(typeof text === "string" ? 5000 : 15000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const out: { reply?: string; actions?: Raw[] } = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
      return { reply: out.reply?.trim() ?? "", intents: (out.actions ?? []).flatMap(toIntent) };
    } catch {
      // try the next model
    }
  }
  return null;
}

function toIntent(r: Raw): Intent[] {
  const title = r.title?.trim() ?? "";
  switch (r.kind) {
    case "task": return title ? [{ kind: "task", title }] : [];
    case "note": return title ? [{ kind: "note", text: title }] : [];
    case "expense":
      return r.amount && r.amount > 0 ? [{ kind: "expense", amount: Math.round(r.amount * 100), item: title || "Voice entry" }] : [];
    case "attendance": {
      const time = r.time && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null;
      const date = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined;
      const status = r.status === "cancelled" ? "CANCELLED" : r.status === "absent" ? "ABSENT" : "ATTENDED";
      return r.course || time ? [{ kind: "attendance", course: r.course ?? "", status, time, date }] : [];
    }
    case "event":
      return r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
        ? [{ kind: "event", title: title || "Event", date: r.date, time: r.time && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null }]
        : [];
    default: return [];
  }
}
