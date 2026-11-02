"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { useData } from "./DataProvider";

export type Tab = {
  id: string;
  blurb: string;
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  isActive: (pathname: string) => boolean;
};

export const TABS: Tab[] = [
  {
    href: "/",
    id: "calendar",
    blurb: "Classes, events and deadlines in one view",
    label: "Calendar",
    isActive: (p) => p === "/",
    icon: () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
        <line x1="3" y1="9.5" x2="21" y2="9.5" />
        <line x1="8" y1="2.5" x2="8" y2="6" />
        <line x1="16" y1="2.5" x2="16" y2="6" />
      </svg>
    ),
  },
  {
    href: "/studies",
    id: "studies",
    blurb: "Exam countdowns and attendance against each threshold",
    label: "Studies",
    isActive: (p) => p.startsWith("/studies"),
    icon: () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M2 9l10-5 10 5-10 5-10-5Z" />
        <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
      </svg>
    ),
  },
  {
    href: "/tracker",
    id: "tracker",
    blurb: "Habits, to-dos, routines and notes",
    label: "Tracker",
    isActive: (p) => p.startsWith("/tracker"),
    icon: () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="M8 8.5h8" />
        <path d="M8 12h8" />
        <path d="M8 15.5h5" />
      </svg>
    ),
  },
  {
    href: "/voice",
    id: "voice",
    blurb: "Speak a command: add tasks, log spending, mark attendance",
    label: "Voice",
    isActive: (p) => p.startsWith("/voice"),
    icon: () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    href: "/money",
    id: "money",
    blurb: "Spending, budgets and what you want to buy",
    label: "Money",
    isActive: (p) => p.startsWith("/money"),
    icon: () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    ),
  },
  {
    href: "/learning",
    id: "learning",
    blurb: "Goals, resources and what you're studying",
    label: "Learning",
    isActive: (p) => p.startsWith("/learning"),
    icon: () => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5Z" />
        <line x1="8" y1="7" x2="16" y2="7" />
        <line x1="8" y1="11" x2="13.5" y2="11" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { db } = useData();
  const shown = TABS.filter((t) => !db.settings.features || db.settings.features.includes(t.id));
  const voice = shown.find((t) => t.id === "voice");
  const tabs = shown.filter((t) => t.id !== "voice");
  if (voice) tabs.splice(Math.floor(tabs.length / 2), 0, voice);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-accent" : "text-text-secondary",
              )}
            >
              {tab.icon(active)}
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
