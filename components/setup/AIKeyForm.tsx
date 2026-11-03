"use client";

import { useEffect, useState } from "react";
import { getAIKey, setAIKey } from "@/lib/voiceAI";
import { btn, cx, Card } from "../ui";

export function AIKeyForm() {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const k = getAIKey();
    setSaved(k);
    setDraft(k);
  }, []);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="text-xs font-medium text-text-secondary">Voice AI key (Anthropic)</span>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-…"
          aria-label="Anthropic API key"
          autoComplete="off"
          className="min-w-0 flex-1 font-mono text-sm"
        />
        <button
          type="button"
          disabled={draft.trim() === saved}
          onClick={() => { setAIKey(draft); setSaved(draft.trim()); }}
          className={cx(btn.base, btn.primary, "px-3 py-1.5 text-xs")}
        >
          Save
        </button>
      </div>
      <p className="text-[11px] text-text-secondary">
        Optional. With a key, Voice cleans up what you say and understands free phrasing. What you say is
        sent to Anthropic. The key stays on this phone only. Without it, basic command matching is used.
      </p>
    </Card>
  );
}
