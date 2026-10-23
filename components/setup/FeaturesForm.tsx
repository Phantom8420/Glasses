"use client";

import { useData } from "../DataProvider";
import { FeatureList } from "../FeatureList";
import { ALL_FEATURES } from "@/lib/store";

export function FeaturesForm() {
  const { db, mutate } = useData();
  const selected = db.settings.features ?? ALL_FEATURES;

  const toggle = (id: string) =>
    mutate((d) => {
      const cur = d.settings.features ?? ALL_FEATURES;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      // Keep at least one tab, or the bar would be empty.
      if (next.length) d.settings.features = ALL_FEATURES.filter((x) => next.includes(x));
    });

  return (
    <>
      <p className="text-sm text-text-secondary">
        Choose which tabs show in the bottom bar. Your data stays when a tab is hidden.
      </p>
      <FeatureList selected={selected} onToggle={toggle} />
    </>
  );
}
