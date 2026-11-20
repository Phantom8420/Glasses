"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type DB, emptyDB, runRecurring, purgeOldDoneTasks } from "@/lib/store";
import { loadDB, saveDB, resetStore } from "@/lib/persist";
import { todayISO } from "@/lib/time";
import { syncNotifications } from "@/lib/notifications";
import { refreshOss, ossDeps, type RefreshResult } from "@/lib/oss";

interface DataContextValue {
  db: DB;
  ready: boolean;
  /** Apply a store mutation to a cloned draft, persist, and re-render. */
  mutate: (fn: (draft: DB) => void) => void;
  /** Wipe back to fresh sample data. */
  reset: () => void;
  /** Once-a-day GitHub refresh; the 24h lock lives inside refreshOss. */
  refreshOssNow: () => Promise<RefreshResult>;
  ossResult: RefreshResult | null;
  ossBusy: boolean;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => emptyDB());
  const [ready, setReady] = useState(false);
  const [ossResult, setOssResult] = useState<RefreshResult | null>(null);
  const [ossBusy, setOssBusy] = useState(false);
  // Latest state, readable synchronously: refreshOss must persist its lock
  // before the next HTTP call, so it cannot wait for a render.
  const dbRef = useRef(db);

  useEffect(() => {
    let active = true;
    loadDB()
      .then((loaded) => {
        if (!active) return;
        // Daily housekeeping on open, both idempotent:
        // • post any recurring transactions due since last open
        // • drop tasks completed on a previous day
        const today = todayISO();
        const changed =
          runRecurring(loaded, today) + purgeOldDoneTasks(loaded, today);
        if (changed > 0) void saveDB(loaded);
        dbRef.current = loaded;
        setDb(loaded);
        setReady(true);
      })
      .catch((err) => {
        // Never leave the app on a spinner. Surface the failure and come up
        // with an empty store rather than hanging on "Loading…" forever.
        console.error("loadDB failed", err);
        if (active) {
          dbRef.current = emptyDB();
          setDb(dbRef.current);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // structuredClone gives every mutate() call fresh references even when
  // nothing relevant changed, so key the notification resync off the actual
  // fields that feed it (tasks, events, and everything renderDays uses for
  // classes) rather than re-running — and re-touching the native plugin —
  // on every unrelated edit elsewhere in the app.
  const notifySignature = useMemo(() => {
    const taskSig = db.tasks
      .map((t) => `${t.id}:${t.done}:${t.due_date}:${t.created_at}`)
      .join(",");
    const eventSig = db.events
      .map((e) => `${e.id}:${e.date}:${e.start_time}`)
      .join(",");
    const slotSig = db.slots
      .map((s) => `${s.id}:${s.day_of_week}:${s.start_time}:${s.course_id}`)
      .join(",");
    const overrideSig = db.overrides
      .map((o) => `${o.date}:${o.kind}:${o.source_day_of_week}`)
      .join(",");
    const instanceSig = db.instances
      .map((i) => `${i.id}:${i.date}:${i.start_time}:${i.status}:${i.course_id}`)
      .join(",");
    return [taskSig, eventSig, slotSig, overrideSig, instanceSig, db.semester?.id]
      .join("|");
  }, [db.tasks, db.events, db.slots, db.overrides, db.instances, db.semester]);

  useEffect(() => {
    if (!ready) return;
    void syncNotifications(db);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, notifySignature]);

  const mutate = useCallback((fn: (draft: DB) => void) => {
    const draft = structuredClone(dbRef.current);
    fn(draft);
    dbRef.current = draft;
    void saveDB(draft);
    setDb(draft);
  }, []);

  const refreshOssNow = useCallback(async () => {
    setOssBusy(true);
    try {
      const r = await refreshOss(
        ossDeps(
          () => dbRef.current.oss,
          (fn) => mutate((d) => fn(d.oss)),
        ),
      );
      setOssResult(r);
      return r;
    } finally {
      setOssBusy(false);
    }
  }, [mutate]);

  // Opening the app calls the same locked function; at most one fetch a day.
  useEffect(() => {
    if (ready) void refreshOssNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const reset = useCallback(() => {
    void resetStore().then((fresh) => {
      dbRef.current = fresh;
      setDb(fresh);
    });
  }, []);

  return (
    <DataContext.Provider value={{ db, ready, mutate, reset, refreshOssNow, ossResult, ossBusy }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
