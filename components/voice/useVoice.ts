"use client";

import { useCallback, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { startRecording } from "@/lib/recorder";
import { useData } from "../DataProvider";
import { describe, NOT_UNDERSTOOD, parseCommand, runIntent } from "@/lib/voice";
import { understand } from "@/lib/llm";
import { getCourses, getSlotsForDay, getTasksSorted } from "@/lib/store";
import { addDays, dayOfWeek, todayISO } from "@/lib/time";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type WebRec = {
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

const native = () => Capacitor.isNativePlatform();
const lang = () => navigator.language || "en-US";

// loaded lazily: the plugin's web build touches `window` at import, which breaks static prerender
const tts = () => import("@capacitor-community/text-to-speech").then((m) => m.TextToSpeech);

function speak(text: string) {
  if (native()) tts().then((t) => t.speak({ text, lang: lang(), rate: 1.0 })).catch(() => {});
  else if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

function hush() {
  if (native()) tts().then((t) => t.stop()).catch(() => {});
  else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Tap-to-talk: listens in the background, runs the command, answers out loud. */
export function useVoice() {
  const { db, mutate } = useData();
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const web = useRef<WebRec | null>(null);
  const rec = useRef<ReturnType<typeof startRecording> | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = useCallback((msg: string, ok: boolean, aloud = false) => {
    setStatus({ msg, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), Math.max(3500, msg.length * 70));
    if (aloud) speak(msg);
  }, []);

  const handle = useCallback(
    async (text: string | { audio: string }) => {
      say("Thinking…", true);
      const today = todayISO();
      const names = new Map(getCourses(db).map((c) => [c.id, c.name]));
      const classes = [today, addDays(today, 1)].flatMap((date) =>
        getSlotsForDay(db, dayOfWeek(date)).map((s) => `${date} ${s.start_time.slice(0, 5)} ${names.get(s.course_id)}`),
      );
      const tasks = getTasksSorted(db).filter((t) => !t.done).slice(0, 10).map((t) => t.title);
      // Gemini first; if it's unreachable or finds nothing, fall back to keyword spotting.
      const u = await understand(text, {
        today,
        weekday: WEEKDAYS[dayOfWeek(today)],
        courses: [...names.values()],
        classes,
        tasks,
      });
      let intents = u?.intents ?? [];
      if (!intents.length && u?.reply) return say(u.reply, true, true);
      if (!intents.length) {
        if (typeof text !== "string") return say(NOT_UNDERSTOOD, false, true);
        const k = parseCommand(text);
        intents = k.kind === "unknown" ? [] : [k];
      }
      if (!intents.length) return say(NOT_UNDERSTOOD, false, true);
      const msgs: string[] = [];
      let failed = false;
      mutate((d) => {
        for (const i of intents) {
          const err = runIntent(d, i);
          if (err) failed = true;
          msgs.push(err ?? describe(i));
        }
      });
      say(failed || !u?.reply ? msgs.join(". ") : u.reply, !failed, true);
    },
    [db, mutate, say],
  );

  const toggle = useCallback(async () => {
    if (busy.current) {
      // second tap while listening = stop and use what was heard so far
      if (native()) rec.current?.stop();
      else web.current?.stop();
      return;
    }
    hush();
    if (native()) {
      busy.current = true;
      try {
        rec.current = startRecording();
        setListening(true);
        say("Listening…", true);
        const audio = await rec.current.done;
        setListening(false);
        if (audio) await handle({ audio });
        else say(NOT_UNDERSTOOD, false, true);
      } catch (e) {
        say(`Mic error: ${e instanceof Error ? e.message : String(e)}`, false);
      } finally {
        setListening(false);
        busy.current = false;
      }
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => WebRec;
      webkitSpeechRecognition?: new () => WebRec;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return say("Speech recognition isn't available here", false);
    const r = new Ctor();
    r.lang = lang();
    let heard = "";
    r.onresult = (e) => {
      heard = Array.from(e.results).map((x) => x[0].transcript).join(" ");
    };
    r.onerror = (e) => say(`Mic error: ${e.error}`, false);
    r.onend = () => {
      busy.current = false;
      setListening(false);
      if (heard.trim()) handle(heard);
    };
    web.current = r;
    busy.current = true;
    r.start();
    setListening(true);
    say("Listening…", true);
  }, [handle, say]);

  return { listening, status, toggle };
}
