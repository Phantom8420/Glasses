"use client";

import { useCallback, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { useData } from "../DataProvider";
import { describe, NOT_UNDERSTOOD, parseCommand, runIntent } from "@/lib/voice";

type WebRec = {
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

/** Tap-to-talk: listens in the background, runs the command, reports a one-line status. */
export function useVoice() {
  const { mutate } = useData();
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const web = useRef<WebRec | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = useCallback((msg: string, ok: boolean) => {
    setStatus({ msg, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 3500);
  }, []);

  const handle = useCallback(
    (text: string) => {
      const intent = parseCommand(text);
      if (intent.kind === "unknown") return say(NOT_UNDERSTOOD, false);
      let err: string | null = null;
      mutate((d) => {
        err = runIntent(d, intent);
      });
      say(err ?? describe(intent), !err);
    },
    [mutate, say],
  );

  const toggle = useCallback(async () => {
    if (listening) {
      if (Capacitor.isNativePlatform()) await SpeechRecognition.stop().catch(() => {});
      else web.current?.stop();
      return;
    }
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await SpeechRecognition.requestPermissions();
        if (perm.speechRecognition !== "granted") return say("Microphone permission denied", false);
        setListening(true);
        say("Listening…", true);
        const r = await SpeechRecognition.start({
          language: navigator.language || "en-US",
          maxResults: 3,
          popup: false,
        });
        const text = r.matches?.find((m) => m.trim());
        if (text) handle(text);
        else say(NOT_UNDERSTOOD, false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/no match|no speech|cancel/i.test(msg)) say(NOT_UNDERSTOOD, false);
        else say(`Mic error: ${msg}`, false);
      } finally {
        setListening(false);
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
    r.lang = navigator.language || "en-US";
    let heard = "";
    r.onresult = (e) => {
      heard = Array.from(e.results).map((x) => x[0].transcript).join(" ");
    };
    r.onerror = (e) => say(`Mic error: ${e.error}`, false);
    r.onend = () => {
      setListening(false);
      if (heard.trim()) handle(heard);
    };
    web.current = r;
    r.start();
    setListening(true);
    say("Listening…", true);
  }, [listening, handle, say]);

  return { listening, status, toggle };
}
