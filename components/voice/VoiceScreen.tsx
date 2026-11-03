"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { useData } from "../DataProvider";
import { btn, Card, cx, SectionTitle } from "../ui";
import { describe, parseCommand, runIntent, type Intent } from "@/lib/voice";

// Web Speech API isn't in lib.dom.d.ts everywhere.
type Rec = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

const EXAMPLES = [
  "add task buy milk",
  "spent 200 on lunch",
  "note: call the landlord",
  "mark Maths present",
];

export function VoiceScreen() {
  const { db, ready, mutate } = useData();
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Intent[]>([]);
  const [log, setLog] = useState<{ msg: string; ok: boolean }[]>([]);
  const rec = useRef<Rec | null>(null);

  const native = useRef(false);

  useEffect(() => {
    // The Android WebView has no Web Speech API, so use the system recognizer there.
    if (Capacitor.isNativePlatform()) {
      native.current = true;
      SpeechRecognition.available().then(
        (r) => { if (!r.available) setSupported(false); },
        () => setSupported(false),
      );
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setText(t);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      setLog((l) => [{ msg: `Mic error: ${e.error}`, ok: false }, ...l]);
    };
    rec.current = r;
    return () => r.stop();
  }, []);

  // Google's own listening dialog: it handles silence, noise and the final result.
  async function toggleNative() {
    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        setLog((l) => [{ msg: "Microphone permission denied. Allow it in Android settings, or type a command.", ok: false }, ...l]);
        return;
      }
      setText(""); setPending([]);
      setListening(true);
      const r = await SpeechRecognition.start({
        language: navigator.language || "en-US",
        maxResults: 1,
        prompt: "Say a command",
        popup: true,
      });
      setText(r.matches?.[0] ?? "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Closing the dialog without speaking isn't an error worth showing.
      if (!/cancel|no match|no speech|back/i.test(msg))
        setLog((l) => [{ msg: `Mic error: ${msg}`, ok: false }, ...l]);
    } finally {
      setListening(false);
    }
  }

  function toggle() {
    if (native.current) { void toggleNative(); return; }
    if (!rec.current) return;
    if (listening) { rec.current.stop(); return; }
    setText(""); setPending([]);
    rec.current.start();
    setListening(true);
  }

  // Parse whenever the transcript settles (mic stopped or typed).
  useEffect(() => {
    if (listening || !text.trim()) { setPending([]); return; }
    const i = parseCommand(text);
    setPending(i.kind === "unknown" ? [] : [i]);
  }, [text, listening]);

  function saveAs(kind: "task" | "note") {
    const t = text.trim();
    const intent: Intent = kind === "task" ? { kind, title: t } : { kind, text: t };
    mutate((d) => { runIntent(d, intent); });
    setLog((l) => [{ msg: describe(intent), ok: true }, ...l].slice(0, 20));
    setText("");
  }

  function confirm() {
    const intents = pending;
    const results: { msg: string; ok: boolean }[] = [];
    mutate((d) => {
      for (const i of intents) {
        const err = runIntent(d, i);
        results.push({ msg: err ?? describe(i), ok: !err });
      }
    });
    setLog((l) => [...results.reverse(), ...l].slice(0, 20));
    setText(""); setPending([]);
  }

  if (!ready) return <p className="py-16 text-center text-sm text-text-secondary">Loading…</p>;

  const unrecognised = !listening && text.trim() && pending.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>Voice</SectionTitle>

      <div className="flex flex-col items-center gap-3 py-4">
        <button
          onClick={toggle}
          disabled={!supported}
          aria-label={listening ? "Stop listening" : "Start listening"}
          className={cx(
            "flex h-24 w-24 items-center justify-center rounded-full border transition-colors disabled:opacity-40",
            listening ? "animate-pulse border-accent bg-accent text-white" : "border-border bg-surface text-text-primary hover:border-accent",
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="21" />
          </svg>
        </button>
        <p className="text-sm text-text-secondary">
          {!supported ? "Speech recognition isn't available here — type a command below." : listening ? "Listening…" : "Tap and say what you want"}
        </p>
      </div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="…or type a command"
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />

      {pending.length > 0 && (
        <Card className="flex items-center justify-between gap-3 p-3">
          <ul className="flex flex-col gap-1 text-sm">
            {pending.map((i, n) => <li key={n}>{describe(i)}</li>)}
          </ul>
          <span className="flex shrink-0 gap-1">
            <button className={cx(btn.base, btn.ghost)} onClick={() => { setText(""); setPending([]); }}>Cancel</button>
            <button className={cx(btn.base, btn.primary)} onClick={confirm}>Do it</button>
          </span>
        </Card>
      )}
      {unrecognised && (
        <Card className="flex items-center justify-between gap-3 p-3">
          <span className="text-sm text-text-secondary">Not sure what to do with that. Save it as…</span>
          <span className="flex shrink-0 gap-1">
            <button className={cx(btn.base, btn.ghost)} onClick={() => saveAs("note")}>Note</button>
            <button className={cx(btn.base, btn.primary)} onClick={() => saveAs("task")}>Task</button>
          </span>
        </Card>
      )}

      {log.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {log.map((l, i) => (
            <li key={i} className={cx("text-sm", l.ok ? "text-text-primary" : "text-red-500")}>
              {l.ok ? "✓ " : "✕ "}{l.msg}
            </li>
          ))}
        </ul>
      )}

      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-text-secondary">Try saying</p>
        <ul className="flex flex-col gap-1 text-sm text-text-secondary">
          {EXAMPLES.map((e) => <li key={e}>“{e}”</li>)}
        </ul>
      </div>
    </div>
  );
}
