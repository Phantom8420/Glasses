// Run: npx tsx scripts/oss-check.ts  (no network, no token: fetch is faked)
import assert from "node:assert/strict";
import { DAY, emptyOss, refreshOss, type OssData, type OssDeps } from "../lib/oss";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function make(handler: (url: string) => Response, start = 1_000_000_000_000) {
  let data: OssData = emptyOss();
  let t = start;
  const calls: string[] = [];
  const d: OssDeps = {
    get: () => data,
    update: (fn) => {
      data = structuredClone(data);
      fn(data);
    },
    token: async () => "fake",
    fetch: async (url) => {
      calls.push(url);
      return handler(url);
    },
    now: () => t,
    sleep: async () => {},
  };
  return { d, calls, data: () => data, advance: (ms: number) => (t += ms), set: (v: number) => (t = v) };
}

const issue = (repo: string, n: number) => ({
  repository_url: `https://api.github.com/repos/${repo}`,
  number: n,
  title: `t${n}`,
  state: "open",
  html_url: `https://github.com/${repo}/pull/${n}`,
  updated_at: "2026-11-01T00:00:00Z",
  pull_request: {},
});

const happy = (url: string): Response => {
  if (url.includes("/search/issues") && url.includes("author:Phantom8420+is:public"))
    return json({ items: [issue("a/pub", 1), issue("a/priv", 2), issue("hagelstam/x", 3)] });
  if (url.includes("/search/issues")) return json({ items: [] });
  if (url.endsWith("/repos/a/pub")) return json({ private: false, license: { key: "mit" } });
  if (url.endsWith("/repos/a/priv")) return json({ private: true, license: { key: "mit" } });
  if (url.includes("/notifications"))
    return json([
      { id: "1", reason: "comment", unread: true, updated_at: "2026-11-02T00:00:00Z", repository: { private: false, full_name: "a/pub" }, subject: { title: "ok", url: "https://api.github.com/repos/a/pub/pulls/1" } },
      { id: "2", reason: "comment", unread: true, updated_at: "2026-11-02T00:00:00Z", repository: { private: true, full_name: "a/priv" }, subject: { title: "SECRET", url: "" } },
    ]);
  if (url.includes("/graphql")) return json({ data: { viewer: { repositoryDiscussionComments: { nodes: [] } } } });
  return json({}, 404);
};

(async () => {
  // 1 + 2: data is filtered, and a second run is locked with zero network calls
  const a = make(happy);
  assert.deepEqual(await refreshOss(a.d), { ok: true });
  assert.deepEqual(a.data().repos.map((r) => r.name), ["a/pub"]);
  assert.ok(!JSON.stringify(a.data()).includes("SECRET"), "private notification stored");
  assert.ok(!JSON.stringify(a.data()).includes("a/priv\"") || a.data().repoCache["a/priv"] === false);
  assert.equal(a.data().repos.some((r) => r.name === "hagelstam/x"), false);
  assert.ok(a.data().fetchedAt);
  const n = a.calls.length;
  const r2 = await refreshOss(a.d);
  assert.equal(r2.ok === false && r2.reason, "locked");
  assert.equal(a.calls.length, n);
  a.advance(DAY + 1);
  assert.equal((await refreshOss(a.d)).ok, true);

  // 3: offline does not consume the lock or set fetchedAt
  const o = make(() => {
    throw new TypeError("network");
  });
  const ro = await refreshOss(o.d);
  assert.equal(ro.ok === false && ro.reason, "offline");
  assert.equal(o.data().lastFetchAt, null);
  assert.equal(o.data().fetchedAt, null);

  // 4: a run that dies after the first response keeps the lock, never marks fresh
  let calls = 0;
  const k = make((u) => {
    if (++calls > 1) throw new TypeError("killed");
    return happy(u);
  });
  const rk = await refreshOss(k.d);
  assert.equal(rk.ok, false);
  assert.ok(k.data().lastFetchAt !== null);
  assert.equal(k.data().fetchedAt, null);
  assert.equal((await refreshOss(k.d)).ok === false && "locked", "locked");

  // 5: wrong token -> unauthorized, one call, nothing stored
  const u = make(() => json({ message: "Bad credentials" }, 401));
  const ru = await refreshOss(u.d);
  assert.equal(ru.ok === false && ru.reason, "unauthorized");
  assert.equal(u.calls.length, 1);
  assert.equal(u.data().fetchedAt, null);

  // clock moved back: a future lastFetchAt stays locked
  const f = make(happy);
  f.d.update((x) => {
    x.lastFetchAt = 1_000_000_000_000 + 5 * DAY;
  });
  assert.equal((await refreshOss(f.d)).ok, false);
  assert.equal(f.calls.length, 0);

  // 6: 40 pinned repos complete
  const pins = Array.from({ length: 40 }, (_, i) => `o${i}/r${i}`);
  const p = make((url) => (/\/repos\/o\d+\/r\d+$/.test(url) ? json({ private: false, license: { key: "mit" } }) : happy(url)));
  p.d.update((x) => {
    x.pinnedRepos = pins;
  });
  assert.equal((await refreshOss(p.d)).ok, true);
  assert.equal(p.data().repos.length, 41);

  console.log("oss-check: all passed");
})();
