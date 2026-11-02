"use client";

import { useState } from "react";
import { useData } from "../DataProvider";
import { AttendanceScreen } from "../attendance/AttendanceScreen";
import { ExamsPanel } from "./ExamsPanel";
import { SectionTitle, cx } from "../ui";

type Panel = "exams" | "attendance";

export function StudiesScreen() {
  const { db, ready } = useData();
  const [picked, setPicked] = useState<Panel | null>(null);

  if (!ready) {
    return (
      <p className="py-16 text-center text-sm text-text-secondary">Loading…</p>
    );
  }

  const panel: Panel = picked ?? (db.exams.length > 0 ? "exams" : "attendance");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionTitle>Studies</SectionTitle>
        {db.semester && (
          <span className="font-mono text-xs text-text-secondary">
            {db.semester.name}
          </span>
        )}
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(["exams", "attendance"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPicked(p)}
            aria-pressed={panel === p}
            className={cx(
              "flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors",
              panel === p ? "bg-accent text-bg" : "text-text-secondary",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {panel === "exams" ? <ExamsPanel /> : <AttendanceScreen />}
    </div>
  );
}
