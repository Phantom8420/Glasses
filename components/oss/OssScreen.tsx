"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { btn, cx, Card, SectionTitle } from "../ui";
import { useData } from "../DataProvider";
import {
  STANDPOINT_SUGGESTIONS,
  ageText,
  getToken,
  isOld,
  nextRefreshAt,
  reasonText,
  setToken,
  stalePartsOf,
  type OssActivity,
  type OssData,
  type OssItem,
  type RefreshResult,
} from "@/lib/oss";
import { addStandpoint, removeStandpoint, setStandpointStatus } from "@/lib/store";

type Tab = "repos" | "activity" | "standpoints" | "reviews";
const TABS: { id: Tab; label: string }[] = [
  { id: "repos", label: "Repos" },
  { id: "activity", label: "Activity" },
  { id: "standpoints", label: "To do" },
  { id: "reviews", label: "Reviews" },
];

const when = (t: number | string) =>
  new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const readKey = (a: OssActivity) => `${a.id}:${a.updatedAt}`;

function resultNote(r: RefreshResult | null): string | null {
  if (!r || r.ok) return null;
  switch (r.reason) {
    case "unauthorized":
      return "Token rejected";
    case "no-token":
      return "Add a GitHub token in Settings";
    case "offline":
      return "Offline, showing last snapshot";
    case "failed":
      return "Refresh failed, showing last snapshot";
    default:
      return null;
  }
}

function Dot() {
  return <span aria-label="needs attention" className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  );
}

export function OssScreen() {
  const { db, mutate, refreshOssNow, ossResult, ossBusy } = useData();
  const o = db.oss;
  const [tab, setTab] = useState<Tab>("repos");
  const [repo, setRepo] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [editToken, setEditToken] = useState(false);
  const [tokenText, setTokenText] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void getToken().then((t) => setHasToken(!!t));
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const next = nextRefreshAt(o);
  const locked = next !== null && now < next;
  const stale = stalePartsOf(o, now);
  const note = resultNote(ossResult) ?? (hasToken === false ? "Add a GitHub token in Settings" : null);

  async function saveToken() {
    if (!tokenText.trim()) return;
    await setToken(tokenText);
    setTokenText("");
    setHasToken(true);
    setEditToken(false);
    void refreshOssNow();
  }

  const names = [...new Set([...o.repos.map((r) => r.name), ...o.knownRepos])].sort();
  const items = (name: string) => o.repos.find((r) => r.name === name)?.items ?? [];
  const unread = (name: string) => o.activity.some((a) => a.repo === name && a.unread);
  const hasTodo = (name: string) => (db.ossStandpoints[name] ?? []).some((s) => s.status === "todo");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-bg/95 px-3 py-2.5 backdrop-blur">
        <Link
          href="/"
          aria-label="Exit to Glasses"
          className="flex h-10 w-10 items-center justify-center rounded-md text-text-primary hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="flex-1 text-base font-semibold">Open source</h1>
        <button onClick={() => setEditToken((v) => !v)} className={cx(btn.ghost, "px-2.5 py-1.5 text-sm")}>
          Token
        </button>
        <button
          onClick={() => void refreshOssNow()}
          disabled={ossBusy || locked}
          className={cx(btn.outline, "px-2.5 py-1.5 text-sm disabled:opacity-50")}
        >
          {ossBusy ? "Refreshing…" : locked ? `Next ${when(next!)}` : "Refresh"}
        </button>
      </header>

      <main className="flex-1 space-y-4 px-4 pb-28 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={isOld(o, now) ? "text-red-500" : "text-text-secondary"}>
            {o.fetchedAt ? `As of ${when(o.fetchedAt)}` : "Not fetched yet"}
          </span>
          {stale.map((p) => (
            <span key={p} className="rounded border border-red-500 px-1.5 py-0.5 text-red-500">
              {p} stale
            </span>
          ))}
        </div>
        {note && <p className="text-sm text-red-500">{note}</p>}

        {(editToken || hasToken === false) && (
          <Card className="space-y-2 p-3">
            <SectionTitle>GitHub token</SectionTitle>
            <p className="text-xs text-text-secondary">
              Classic token with only the notifications scope. Stored on this device, outside your backups.
            </p>
            <input
              type="password"
              autoComplete="off"
              value={tokenText}
              onChange={(e) => setTokenText(e.target.value)}
              placeholder="Paste token"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <button onClick={() => void saveToken()} className={cx(btn.primary, "px-3 py-1.5 text-sm")}>
              Save token
            </button>
          </Card>
        )}

        {tab === "repos" &&
          (repo ? (
            <RepoDetail name={repo} onBack={() => setRepo(null)} items={items(repo)} />
          ) : (
            <ReposList
              names={names}
              items={items}
              unread={unread}
              hasTodo={hasTodo}
              pinned={o.pinnedRepos}
              onOpen={setRepo}
              onPin={(r) =>
                mutate((d) => {
                  if (!d.oss.pinnedRepos.includes(r)) d.oss.pinnedRepos.push(r);
                })
              }
            />
          ))}
        {tab === "activity" && <ActivityList now={now} />}
        {tab === "standpoints" && <Standpoints names={names} />}
        {tab === "reviews" && <Reviews o={o} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setRepo(null);
              }}
              aria-current={tab === t.id ? "page" : undefined}
              className={cx(
                "flex-1 py-3 text-[11px] font-medium transition-colors",
                tab === t.id ? "text-accent" : "text-text-secondary",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ReposList(p: {
  names: string[];
  items: (n: string) => OssItem[];
  unread: (n: string) => boolean;
  hasTodo: (n: string) => boolean;
  pinned: string[];
  onOpen: (n: string) => void;
  onPin: (n: string) => void;
}) {
  const [add, setAdd] = useState("");
  const valid = /^[\w.-]+\/[\w.-]+$/.test(add.trim());
  return (
    <div className="space-y-3">
      <SectionTitle>Repos ({p.names.length})</SectionTitle>
      {p.names.length === 0 && <p className="text-sm text-text-secondary">No repos yet. Refresh once a token is saved.</p>}
      <div className="space-y-2">
        {p.names.map((n) => {
          const its = p.items(n).filter((i) => i.isPR);
          return (
            <button key={n} onClick={() => p.onOpen(n)} className="block w-full text-left">
              <Card className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n}</div>
                  <div className="font-mono text-xs text-text-secondary">
                    {its.filter((i) => i.state === "open").length} open · {its.filter((i) => i.state === "merged").length} merged
                  </div>
                </div>
                {(p.unread(n) || p.hasTodo(n)) && <Dot />}
              </Card>
            </button>
          );
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          p.onPin(add.trim());
          setAdd("");
        }}
      >
        <input
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          placeholder="Add repo: owner/name"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <button disabled={!valid} className={cx(btn.outline, "px-3 text-sm disabled:opacity-50")}>
          Add
        </button>
      </form>
      {p.pinned.length > 0 && (
        <p className="text-xs text-text-secondary">Added repos are checked (public and licensed) on the next refresh.</p>
      )}
    </div>
  );
}

function RepoDetail({ name, items, onBack }: { name: string; items: OssItem[]; onBack: () => void }) {
  const { db } = useData();
  const [now] = useState(() => Date.now());
  const acts = db.oss.activity.filter((a) => a.repo === name);
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-accent">
        ← All repos
      </button>
      <h2 className="break-all text-lg font-semibold">{name}</h2>
      <section className="space-y-2">
        <SectionTitle>PRs and issues</SectionTitle>
        {items.length === 0 && <p className="text-sm text-text-secondary">Nothing found.</p>}
        {items.map((i) => (
          <Card key={i.url} className="p-3 text-sm">
            <ExtLink href={i.url}>{i.title}</ExtLink>
            <div className="mt-1 font-mono text-xs text-text-secondary">
              {i.isPR ? "PR" : "Issue"} #{i.number} · {i.state}
              {i.state === "open" && ` · ${ageText(i.updatedAt, now).replace(" ago", "")} since change`}
            </div>
          </Card>
        ))}
      </section>
      <section className="space-y-2">
        <SectionTitle>Activity</SectionTitle>
        {acts.length === 0 && <p className="text-sm text-text-secondary">None.</p>}
        {acts.map((a) => (
          <ActivityRow key={a.id} a={a} now={now} />
        ))}
      </section>
      <section className="space-y-2">
        <SectionTitle>Standpoints</SectionTitle>
        <StandpointEditor repo={name} />
      </section>
    </div>
  );
}

function ActivityRow({ a, now }: { a: OssActivity; now: number }) {
  const { db, mutate } = useData();
  const isUnread = a.unread && !db.oss.readIds.includes(readKey(a));
  const cla = /\bCLA\b|license agreement/i.test(a.title);
  return (
    <Card className="space-y-1 p-3 text-sm">
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        onClick={() =>
          mutate((d) => {
            if (!d.oss.readIds.includes(readKey(a))) d.oss.readIds.push(readKey(a));
          })
        }
        className="flex items-start gap-2"
      >
        {isUnread && <span className="mt-1.5"><Dot /></span>}
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-text-secondary">
            {reasonText(a.reason)} · {a.repo} · {ageText(a.updatedAt, now)}
          </span>
          <span className="block">{a.title}</span>
        </span>
      </a>
      {cla && (
        <button
          onClick={() => mutate((d) => addStandpoint(d, a.repo, "Sign CLA"))}
          className={cx(btn.subtle, "px-2 py-1 text-xs")}
        >
          Add: Sign CLA
        </button>
      )}
    </Card>
  );
}

function ActivityList({ now }: { now: number }) {
  const { db } = useData();
  const list = db.oss.activity;
  return (
    <div className="space-y-2">
      <SectionTitle>Activity</SectionTitle>
      {list.length === 0 && <p className="text-sm text-text-secondary">No activity yet.</p>}
      {list.map((a) => (
        <ActivityRow key={a.id} a={a} now={now} />
      ))}
    </div>
  );
}

function StandpointEditor({ repo }: { repo: string }) {
  const { db, mutate } = useData();
  const [label, setLabel] = useState("");
  const list = db.ossStandpoints[repo] ?? [];
  const add = (l: string) => {
    if (l.trim()) mutate((d) => addStandpoint(d, repo, l.trim()));
  };
  return (
    <div className="space-y-2">
      {list.length === 0 && (
        <p className="text-sm text-text-secondary">No requirements recorded</p>
      )}
      {list.map((s) => (
        <Card key={s.id} className="flex items-center gap-2 p-2.5 text-sm">
          <span className={cx("min-w-0 flex-1", s.status !== "todo" && "text-text-secondary line-through")}>
            {s.label}
          </span>
          <select
            value={s.status}
            onChange={(e) =>
              mutate((d) => setStandpointStatus(d, repo, s.id, e.target.value as "todo" | "done" | "n/a"))
            }
            className="rounded border border-border bg-bg px-1.5 py-1 text-xs"
          >
            <option value="todo">todo</option>
            <option value="done">done</option>
            <option value="n/a">n/a</option>
          </select>
          <button aria-label={`Remove ${s.label}`} onClick={() => mutate((d) => removeStandpoint(d, repo, s.id))} className="px-1 text-text-secondary hover:text-red-500">
            ×
          </button>
        </Card>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {STANDPOINT_SUGGESTIONS.filter((s) => !list.some((x) => x.label.toLowerCase() === s.toLowerCase())).map((s) => (
          <button key={s} onClick={() => add(s)} className={cx(btn.subtle, "px-2 py-1 text-xs")}>
            + {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(label);
          setLabel("");
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Your own requirement"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <button className={cx(btn.outline, "px-3 text-sm")}>Add</button>
      </form>
    </div>
  );
}

function Standpoints({ names }: { names: string[] }) {
  const { db } = useData();
  const [open, setOpen] = useState<string | null>(null);
  if (names.length === 0) return <p className="text-sm text-text-secondary">No repos yet.</p>;
  return (
    <div className="space-y-2">
      <SectionTitle>Standpoints</SectionTitle>
      {names.map((n) => {
        const list = db.ossStandpoints[n] ?? [];
        const todo = list.filter((s) => s.status === "todo").length;
        return (
          <div key={n} className="space-y-2">
            <button onClick={() => setOpen(open === n ? null : n)} className="block w-full text-left">
              <Card className="flex items-center gap-2 p-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{n}</span>
                <span className="font-mono text-xs text-text-secondary">
                  {list.length === 0 ? "none recorded" : `${todo} todo`}
                </span>
                {todo > 0 && <Dot />}
              </Card>
            </button>
            {open === n && <StandpointEditor repo={n} />}
          </div>
        );
      })}
    </div>
  );
}

function Reviews({ o }: { o: OssData }) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <SectionTitle>Reviews I gave</SectionTitle>
        <p className="text-xs text-text-secondary">Not counted as contributions.</p>
        {o.reviews.length === 0 && <p className="text-sm text-text-secondary">None found.</p>}
        {o.reviews.map((r) => (
          <Card key={r.url} className="p-3 text-sm">
            <ExtLink href={r.url}>{r.title}</ExtLink>
            <div className="mt-1 font-mono text-xs text-text-secondary">
              {r.repo} · {r.state} · {when(r.date)}
            </div>
          </Card>
        ))}
      </section>
      <section className="space-y-2">
        <SectionTitle>Discussion replies</SectionTitle>
        <p className="text-xs text-text-secondary">Not counted as contributions.</p>
        {o.discussions.length === 0 && <p className="text-sm text-text-secondary">None found.</p>}
        {o.discussions.map((r) => (
          <Card key={r.url} className="p-3 text-sm">
            <ExtLink href={r.url}>{r.title}</ExtLink>
            <div className="mt-1 font-mono text-xs text-text-secondary">
              {r.repo} · {when(r.date)}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
