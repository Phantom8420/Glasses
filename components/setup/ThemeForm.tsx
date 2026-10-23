"use client";

import { useEffect, useState } from "react";
import { cx } from "../ui";

type Theme = "dark" | "light";

export function ThemeForm() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const pick = (t: Theme) => {
    setTheme(t);
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", t === "light" ? "#FFFFFF" : "#000000");
    try {
      localStorage.setItem("glasses-theme", t);
    } catch {}
  };

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => pick(t)}
          className={cx(
            "rounded-lg border px-4 py-3 text-[15px] font-medium capitalize transition-colors",
            theme === t
              ? "border-accent bg-accent/10 text-text-primary"
              : "border-border bg-surface text-text-secondary hover:border-text-secondary",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
