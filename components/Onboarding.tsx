"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useData } from "./DataProvider";
import { FeatureList } from "./FeatureList";
import { TABS } from "./BottomNav";
import { ALL_FEATURES } from "@/lib/store";
import { btn, cx } from "./ui";

type Stage = "splash" | "leaving" | "pick";

/** First-run overlay: icon splash, then a picker for which tabs to show.
 *  Also covers the screen while the DB loads, and bounces off disabled tabs. */
export function Onboarding() {
  const { db, ready, mutate } = useData();
  const router = useRouter();
  const pathname = usePathname();
  const features = db.settings.features;
  const needsSetup = ready && features === null;

  const [stage, setStage] = useState<Stage>("splash");
  const [selected, setSelected] = useState<string[]>(ALL_FEATURES);

  useEffect(() => {
    if (!needsSetup) return;
    const a = setTimeout(() => setStage("leaving"), 1500);
    const b = setTimeout(() => setStage("pick"), 2100);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [needsSetup]);

  // Landing on a tab the user turned off goes to the first one they kept.
  useEffect(() => {
    if (!ready || !features || pathname.startsWith("/setup")) return;
    const enabled = TABS.filter((t) => features.includes(t.id));
    if (enabled.length && !enabled.some((t) => t.isActive(pathname))) {
      router.replace(enabled[0].href);
    }
  }, [ready, features, pathname, router]);

  if (ready && features !== null) return null;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const finish = () => {
    const ordered = ALL_FEATURES.filter((id) => selected.includes(id));
    mutate((d) => {
      d.settings.features = ordered;
    });
    router.replace(TABS.find((t) => t.id === ordered[0])!.href);
  };

  const allOn = selected.length === ALL_FEATURES.length;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg">
      {stage !== "pick" ? (
        <div className="flex min-h-dvh items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="Glasses"
            width={176}
            height={176}
            className={cx("h-44 w-44", stage === "splash" ? "ob-in" : "ob-out")}
          />
        </div>
      ) : (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" width={64} height={64} className="ob-rise -ml-2 h-16 w-16" />
          <h1
            className="ob-rise mt-4 text-[28px] font-semibold leading-tight tracking-tight text-text-primary [text-wrap:balance]"
            style={{ animationDelay: "60ms" }}
          >
            What do you want Glasses for?
          </h1>
          <p
            className="ob-rise mb-6 mt-2 text-sm text-text-secondary"
            style={{ animationDelay: "120ms" }}
          >
            Only what you pick gets a spot in the bar. You can change this any time in Setup.
          </p>

          <FeatureList selected={selected} onToggle={toggle} animate />

          <div className="sticky bottom-0 mt-auto flex items-center gap-3 bg-bg pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
            <button
              type="button"
              onClick={() => setSelected(allOn ? [] : ALL_FEATURES)}
              className={cx(btn.base, btn.ghost)}
            >
              {allOn ? "Clear" : "Select all"}
            </button>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={finish}
              className={cx(btn.base, btn.primary, "flex-1 py-3")}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
