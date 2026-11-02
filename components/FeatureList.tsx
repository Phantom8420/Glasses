"use client";

import { TABS } from "./BottomNav";
import { cx } from "./ui";

/** Toggle list of the app's tabs. Used by first-run onboarding and Setup. */
export function FeatureList({
  selected,
  onToggle,
  animate,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  animate?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {TABS.filter((t) => t.id !== "voice").map((tab, i) => {
        const on = selected.includes(tab.id);
        return (
          <li
            key={tab.id}
            className={animate ? "ob-rise" : undefined}
            style={animate ? { animationDelay: `${180 + i * 70}ms` } : undefined}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(tab.id)}
              className={cx(
                "flex w-full items-center gap-3.5 rounded-lg border px-4 py-3.5 text-left transition-colors",
                on
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-text-secondary",
              )}
            >
              <span className={on ? "text-blue-neon" : "text-text-secondary"}>
                {tab.icon(on)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-text-primary">
                  {tab.label}
                </span>
                <span className="block text-xs text-text-secondary">
                  {tab.blurb}
                </span>
              </span>
              <span
                aria-hidden
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  on ? "border-accent bg-accent" : "border-border",
                )}
              >
                {on && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
