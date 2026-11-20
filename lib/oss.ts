import { Preferences } from "@capacitor/preferences";

// ---------------------------------------------------------------------------
// OSS tracker: a once-a-day, read-only snapshot of public GitHub data.
// Everything goes through refreshOss(); the 24h lock lives there, not in a
// button. Nothing here writes to GitHub.
// ---------------------------------------------------------------------------

export const LOGIN = "Phantom8420";
const OWN_LOGINS = ["phantom8420", "specter842"];
export const DAY = 24 * 60 * 60 * 1000;
export const STALE_MS = 36 * 60 * 60 * 1000;
const API = "https://api.github.com";
const SEARCH_GAP_MS = 3000;

export type Part = "search" | "notifications" | "reviews" | "discussions";
export const PARTS: Part[] = ["search", "notifications", "reviews", "discussions"];
export type PartState = "ok" | "failed" | "never";

export interface Standpoint {
  id: number;
  label: string;
  status: "todo" | "done" | "n/a";
  note?: string;
  link?: string;
}

export const STANDPOINT_SUGGESTIONS = [
  "Sign CLA",
  "DCO sign-off",
  "AI disclosure line",
  "Read contributing guide",
  "Claim issue first",
];

export interface OssItem {
  repo: string;
  number: number;
  title: string;
  state: "open" | "merged" | "closed";
  isPR: boolean;
  url: string;
  updatedAt: string;
}
export interface OssRepo {
  name: string;
  items: OssItem[];
}
export interface OssActivity {
  id: string;
  reason: string;
  repo: string;
  title: string;
  url: string;
  updatedAt: string;
  unread: boolean;
}
export interface OssReview {
  repo: string;
  title: string;
  state: OssItem["state"];
  date: string;
  url: string;
}
export interface OssDiscussion {
  repo: string;
  title: string;
  date: string;
  url: string;
}

export interface OssData {
  repos: OssRepo[];
  activity: OssActivity[];
  reviews: OssReview[];
  discussions: OssDiscussion[];
  fetchedAt: string | null;
  lastFetchAt: number | null;
  sources: Record<Part, PartState>;
  repoCache: Record<string, boolean>;
  knownRepos: string[];
  pinnedRepos: string[];
  ignoreOwners: string[];
  /** `${notificationId}:${updated_at}` the user opened here (local dot only). */
  readIds: string[];
  /** The OSS tab was offered to existing installs once. */
  tabOffered: boolean;
}

export function emptyOss(): OssData {
  return {
    repos: [],
    activity: [],
    reviews: [],
    discussions: [],
    fetchedAt: null,
    lastFetchAt: null,
    sources: { search: "never", notifications: "never", reviews: "never", discussions: "never" },
    repoCache: {},
    knownRepos: [],
    pinnedRepos: [],
    ignoreOwners: ["dhruv2983-org", "hagelstam", "is-a-dev"],
    readIds: [],
    tabOffered: false,
  };
}

// --- token: its own Preferences key, never inside the main DB document -----

const TOKEN_KEY = "glasses-oss-token";
export async function getToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value || null;
}
export async function setToken(t: string): Promise<void> {
  await Preferences.set({ key: TOKEN_KEY, value: t.trim() });
}
export async function clearToken(): Promise<void> {
  await Preferences.remove({ key: TOKEN_KEY });
}

// --- refresh ----------------------------------------------------------------

export interface OssDeps {
  get: () => OssData;
  update: (fn: (o: OssData) => void) => void;
  token: () => Promise<string | null>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export type RefreshResult =
  | { ok: true }
  | {
      ok: false;
      reason: "locked" | "busy" | "no-token" | "unauthorized" | "offline" | "failed";
      nextAt?: number;
    };

class Offline extends Error {}
class Unauthorized extends Error {}

let running = false;

export async function refreshOss(d: OssDeps): Promise<RefreshResult> {
  const t0 = d.now();
  const prevLast = d.get().lastFetchAt;
  // A future lastFetchAt (clock moved back) stays locked until it + 24h.
  if (prevLast !== null && t0 < prevLast + DAY) {
    return { ok: false, reason: "locked", nextAt: prevLast + DAY };
  }
  if (running) return { ok: false, reason: "busy" };
  running = true;
  try {
    const token = await d.token();
    if (!token) return { ok: false, reason: "no-token" };

    let responded = false;
    let searchCalls = 0;
    const call = async (url: string, init: RequestInit = {}) => {
      let res: Response;
      try {
        res = await d.fetch(url, {
          ...init,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            ...(init.headers as Record<string, string> | undefined),
          },
        });
      } catch {
        throw new Offline();
      }
      if (!responded) {
        responded = true;
        d.update((o) => {
          o.lastFetchAt = d.now(); // lock is consumed before the rest of the run
        });
      }
      if (res.status === 401) throw new Unauthorized();
      return res;
    };
    const json = async (url: string, init?: RequestInit) => {
      const res = await call(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const search = async (q: string, page = 1) => {
      if (searchCalls++ > 0) await d.sleep(SEARCH_GAP_MS);
      return json(`${API}/search/issues?q=${q}&per_page=100&page=${page}`);
    };

    let anyOk = false;
    const run = async (part: Part, fn: () => Promise<void>) => {
      try {
        await fn();
        anyOk = true;
        d.update((o) => {
          o.sources[part] = "ok";
        });
      } catch (e) {
        if (e instanceof Unauthorized) throw e;
        if (e instanceof Offline && !responded) throw e;
        d.update((o) => {
          o.sources[part] = "failed";
        });
      }
    };

    try {
      await run("search", async () => {
        const cur = d.get();
        const skip = new Set([...OWN_LOGINS, ...cur.ignoreOwners.map((s) => s.toLowerCase())]);
        const grouped = new Map<string, OssItem[]>();
        for (let page = 1; page <= 10; page++) {
          const data = await search(`author:${LOGIN}+is:public`, page);
          for (const it of data.items ?? []) {
            const repo = String(it.repository_url).replace(`${API}/repos/`, "");
            if (skip.has(repo.split("/")[0].toLowerCase())) continue;
            const list = grouped.get(repo) ?? [];
            list.push(toItem(repo, it));
            grouped.set(repo, list);
          }
          if ((data.items ?? []).length < 100) break;
        }
        // Verdict (public + licensed) once per repo, cached.
        const cache = { ...cur.repoCache };
        const candidates = new Set([...grouped.keys(), ...cur.pinnedRepos]);
        let verdictFailed = false;
        for (const r of candidates) {
          if (r in cache) continue;
          try {
            const res = await call(`${API}/repos/${r}`);
            if (res.status === 404) cache[r] = false;
            else if (res.ok) {
              const m = await res.json();
              cache[r] = m.private === false && m.license != null;
            } else verdictFailed = true;
          } catch (e) {
            if (e instanceof Unauthorized) throw e;
            verdictFailed = true;
          }
        }
        const names = new Set(cur.knownRepos);
        for (const r of candidates) if (cache[r] === true) names.add(r);
        d.update((o) => {
          o.repoCache = cache;
          o.knownRepos = [...names];
          o.repos = [...names]
            .sort()
            .map((name) => ({ name, items: grouped.get(name) ?? [] }));
        });
        if (verdictFailed) throw new Error("repo check failed");
      });

      await run("notifications", async () => {
        const out: OssActivity[] = [];
        const readIds = d.get().readIds;
        for (let page = 1; page <= 2; page++) {
          const data = await json(`${API}/notifications?all=true&per_page=50&page=${page}`);
          for (const n of data) {
            if (n.repository?.private !== false) continue; // drop, never store
            const repo = n.repository.full_name as string;
            out.push({
              id: String(n.id),
              reason: n.reason,
              repo,
              title: n.subject?.title ?? "",
              url: htmlUrl(n.subject?.url, repo),
              updatedAt: n.updated_at,
              unread: !!n.unread && !readIds.includes(`${n.id}:${n.updated_at}`),
            });
          }
          if (data.length < 50) break;
        }
        out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        d.update((o) => {
          o.activity = out;
        });
      });

      await run("reviews", async () => {
        const seen = new Map<string, OssReview>();
        for (const who of ["reviewed-by", "commenter"]) {
          const data = await search(`is:pr+${who}:${LOGIN}+-author:${LOGIN}+is:public`);
          for (const it of data.items ?? []) {
            const repo = String(it.repository_url).replace(`${API}/repos/`, "");
            const item = toItem(repo, it);
            seen.set(item.url, {
              repo,
              title: item.title,
              state: item.state,
              date: item.updatedAt,
              url: item.url,
            });
          }
        }
        const list = [...seen.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
        d.update((o) => {
          o.reviews = list;
        });
      });

      await run("discussions", async () => {
        const query =
          "{ viewer { repositoryDiscussionComments(first: 50) { nodes { updatedAt discussion { title url repository { nameWithOwner isPrivate } } } } } }";
        const data = await json(`${API}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        if (data.errors) throw new Error("graphql error");
        const seen = new Map<string, OssDiscussion>();
        for (const n of data.data?.viewer?.repositoryDiscussionComments?.nodes ?? []) {
          const disc = n.discussion;
          if (!disc || disc.repository?.isPrivate !== false) continue;
          const prev = seen.get(disc.url);
          if (!prev || n.updatedAt > prev.date) {
            seen.set(disc.url, {
              repo: disc.repository.nameWithOwner,
              title: disc.title,
              date: n.updatedAt,
              url: disc.url,
            });
          }
        }
        const list = [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
        d.update((o) => {
          o.discussions = list;
        });
      });
    } catch (e) {
      if (e instanceof Unauthorized) {
        // Nothing was fetched; give the day back so a fixed token can retry.
        d.update((o) => {
          o.lastFetchAt = prevLast;
        });
        return { ok: false, reason: "unauthorized" };
      }
      if (e instanceof Offline) return { ok: false, reason: "offline" };
      throw e;
    }

    if (!anyOk) return { ok: false, reason: "failed" };
    d.update((o) => {
      o.fetchedAt = new Date(d.now()).toISOString();
    });
    return { ok: true };
  } finally {
    running = false;
  }
}

function toItem(repo: string, it: any): OssItem {
  const isPR = !!it.pull_request;
  return {
    repo,
    number: it.number,
    title: it.title,
    isPR,
    state: isPR && it.pull_request.merged_at ? "merged" : it.state === "open" ? "open" : "closed",
    url: it.html_url,
    updatedAt: it.updated_at,
  };
}

// --- pure helpers -------------------------------------------------------------

/** API subject URL to the page a person would open. */
export function htmlUrl(apiUrl: string | null | undefined, repo: string): string {
  if (!apiUrl) return `https://github.com/${repo}`;
  return apiUrl
    .replace("https://api.github.com/repos/", "https://github.com/")
    .replace("/pulls/", "/pull/");
}

const REASONS: Record<string, string> = {
  comment: "New comment",
  review_requested: "Review requested",
  state_change: "Merged or closed",
  ci_activity: "CI result",
  mention: "You were mentioned",
  author: "Activity on your PR",
  assign: "Assigned to you",
};
export function reasonText(reason: string): string {
  return REASONS[reason] ?? "Activity";
}

export function ageText(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/** Parts to flag: any failed source, or everything once the snapshot is old. */
export function stalePartsOf(o: OssData, now: number): Part[] {
  if (o.fetchedAt && now - Date.parse(o.fetchedAt) > STALE_MS) return PARTS;
  return PARTS.filter((p) => o.sources[p] === "failed");
}
export function isOld(o: OssData, now: number): boolean {
  return !!o.fetchedAt && now - Date.parse(o.fetchedAt) > STALE_MS;
}

export function nextRefreshAt(o: OssData): number | null {
  return o.lastFetchAt === null ? null : o.lastFetchAt + DAY;
}

export function ossDeps(get: () => OssData, update: (fn: (o: OssData) => void) => void): OssDeps {
  return {
    get,
    update,
    token: getToken,
    fetch: (u, i) => fetch(u, i),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
