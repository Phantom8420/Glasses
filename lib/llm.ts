import { numberWords, type Intent } from "./voice";

// shortcut: key is baked into the APK at build time (personal app); proxy it before sharing the app.
const KEY = process.env.NEXT_PUBLIC_GEMINI_KEY;
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: ["task", "note", "expense", "attendance", "event"] },
      title: { type: "STRING" },
      amount: { type: "NUMBER" },
      course: { type: "STRING" },
      status: { type: "STRING", enum: ["present", "absent"] },
      date: { type: "STRING" },
      time: { type: "STRING" },
    },
    required: ["kind"],
  },
};

type Raw = { kind: string; title?: string; amount?: number; course?: string; status?: string; date?: string; time?: string };

/** Turns a spoken sentence into intents. Returns null when Gemini is unreachable, [] when it found nothing. */
export async function understand(
  text: string,
  ctx: { today: string; weekday: string; courses: string[] },
): Promise<Intent[] | null> {
  if (!KEY) return null;
  const system =
    `You turn a spoken command (speech-to-text, often garbled: "at task" means "add task") into actions for a personal organiser. ` +
    `Today is ${ctx.today} (${ctx.weekday}). Courses: ${ctx.courses.join(", ") || "none"}. ` +
    `Actions: task (title), note (title = the note text), expense (amount in major currency units, title = what it was for), ` +
    `attendance (course = exact name from the course list, status present|absent), event (title, date YYYY-MM-DD resolved from words like "friday" or "tomorrow" to the next such date, time HH:MM 24h or omit; "five" with no am/pm means 17:00). ` +
    `One utterance may hold several actions. Return [] if it is not one of these. Keep titles short, in the speaker's words.`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: numberWords(text) }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const raw: Raw[] = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
      return raw.flatMap(toIntent);
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
    case "attendance":
      return r.course ? [{ kind: "attendance", course: r.course, status: r.status === "absent" ? "ABSENT" : "ATTENDED" }] : [];
    case "event":
      return r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
        ? [{ kind: "event", title: title || "Event", date: r.date, time: r.time && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null }]
        : [];
    default: return [];
  }
}
