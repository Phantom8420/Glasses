import type { Intent } from "./voice";

const KEY = "glasses-ai-key";
const MODEL = "claude-haiku-5-5";

export function getAIKey(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function setAIKey(k: string) {
  try {
    if (k.trim()) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch {}
}

type Raw = {
  kind: "task" | "note" | "expense" | "attendance";
  title?: string; text?: string; amount?: number; item?: string; course?: string;
  status?: "present" | "absent";
};

const TOOL = {
  name: "result",
  description: "Report the cleaned-up transcript and the actions the speaker asked for.",
  input_schema: {
    type: "object",
    properties: {
      clean: { type: "string", description: "The transcript with filler words, repeats and false starts removed, fixed grammar and punctuation. Keep the speaker's meaning and wording." },
      actions: {
        type: "array",
        description: "Every action the speaker asked for. Empty if they were just dictating text.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["task", "note", "expense", "attendance"] },
            title: { type: "string", description: "task: short imperative title" },
            text: { type: "string", description: "note: the note text" },
            amount: { type: "number", description: "expense: amount in major units, e.g. 12.5" },
            item: { type: "string", description: "expense: what it was for" },
            course: { type: "string", description: "attendance: exact name from the course list" },
            status: { type: "string", enum: ["present", "absent"] },
          },
          required: ["kind"],
        },
      },
    },
    required: ["clean", "actions"],
  },
};

function toIntent(a: Raw): Intent | null {
  switch (a.kind) {
    case "task": return a.title ? { kind: "task", title: a.title } : null;
    case "note": return a.text ? { kind: "note", text: a.text } : null;
    case "expense":
      return a.amount && a.amount > 0
        ? { kind: "expense", amount: Math.round(a.amount * 100), item: a.item?.trim() || "Voice entry" }
        : null;
    case "attendance":
      return a.course && a.status
        ? { kind: "attendance", course: a.course, status: a.status === "absent" ? "ABSENT" : "ATTENDED" }
        : null;
  }
}

/** Throws on network/API errors so the caller can fall back to the rule parser. */
export async function parseWithAI(
  transcript: string,
  courses: string[],
): Promise<{ clean: string; intents: Intent[] }> {
  const key = getAIKey();
  if (!key) throw new Error("no key");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system:
          "You turn a speech-recognition transcript from a personal organiser app into clean text and actions. " +
          "The transcript may contain recognition errors; fix obvious ones. " +
          `Courses the user has: ${courses.length ? courses.join(", ") : "none"}. ` +
          "Only create an action when the speaker clearly asked for it.",
        tools: [TOOL],
        tool_choice: { type: "tool", name: "result" },
        messages: [{ role: "user", content: transcript }],
      }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Invalid API key" : `AI error ${res.status}`);
    const data = await res.json();
    const out = data.content?.find((c: { type: string }) => c.type === "tool_use")?.input as
      | { clean?: string; actions?: Raw[] }
      | undefined;
    if (!out) throw new Error("Empty AI reply");
    return {
      clean: out.clean?.trim() || transcript,
      intents: (out.actions ?? []).map(toIntent).filter((i): i is Intent => !!i),
    };
  } finally {
    clearTimeout(timer);
  }
}
