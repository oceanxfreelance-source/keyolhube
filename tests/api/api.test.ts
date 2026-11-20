// Runs against a live server: API_BASE=http://localhost:3100 npx vitest run -c vitest.api.config.ts
import { deflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { make, newDoc } from "@/lib/doc/factory";

const BASE = process.env.API_BASE ?? "http://localhost:3100";

class Client {
  cookie = "";
  async req(path: string, init: RequestInit = {}) {
    const res = await fetch(BASE + path, { ...init, headers: { ...(init.headers ?? {}), cookie: this.cookie, origin: BASE }, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [kv] = c.split(";");
      const name = kv.split("=")[0];
      this.cookie = [...this.cookie.split("; ").filter((x) => x && !x.startsWith(name + "=")), kv].join("; ");
    }
    return res;
  }
  json(path: string, method: string, body?: unknown) {
    return this.req(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
}

function png(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 255; raw[i + 1] = (x * 255) / w; raw[i + 2] = 80; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const alice = new Client(), bob = new Client();
const stamp = Date.now();

beforeAll(async () => {
  for (const [c, n] of [[alice, "alice"], [bob, "bob"]] as const) {
    const r = await c.json("/api/auth/sign-up/email", "POST", { name: n, email: `${n}${stamp}@test.mv`, password: "correct horse 1" });
    expect(r.status).toBe(200);
  }
});

describe("auth", () => {
  it("rejects wrong password and accepts the right one", async () => {
    const c = new Client();
    expect((await c.json("/api/auth/sign-in/email", "POST", { email: `alice${stamp}@test.mv`, password: "nope nope 1" })).status).toBe(401);
    expect((await c.json("/api/auth/sign-in/email", "POST", { email: `alice${stamp}@test.mv`, password: "correct horse 1" })).status).toBe(200);
    expect((await c.req("/api/projects")).status).toBe(200);
  });
  it("blocks unauthenticated access", async () => {
    expect((await new Client().req("/api/projects")).status).toBe(401);
  });
});

describe("projects", () => {
  let id = "", revision = 0;
  const doc = newDoc(1080, 1080);
  doc.pages[0].children.push(make.rect(10, 10, 100, 100), make.text(50, 300, "ދިވެހި Maldives"));

  it("creates, lists, searches and loads", async () => {
    const r = await alice.json("/api/projects", "POST", { title: "Election poster", doc });
    expect(r.status).toBe(201);
    const p = await r.json();
    id = p.id; revision = p.revision;
    expect(p.width).toBe(1080);
    const list = await (await alice.req("/api/projects?q=poster")).json();
    expect(list.projects.map((x: { id: string }) => x.id)).toContain(id);
    const none = await (await alice.req("/api/projects?q=zzz")).json();
    expect(none.projects).toHaveLength(0);
    const loaded = await (await alice.req(`/api/projects/${id}`)).json();
    expect(loaded.doc.pages[0].children[1].text).toBe("ދިވެހި Maldives");
  });

  it("rejects invalid documents", async () => {
    const bad = structuredClone(doc) as unknown as { pages: { children: { opacity: number }[] }[] };
    bad.pages[0].children[0].opacity = 7;
    const r = await alice.json(`/api/projects/${id}`, "PATCH", { baseRevision: revision, doc: bad });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/opacity/);
  });

  it("saves with optimistic concurrency and makes an automatic snapshot", async () => {
    const d2 = structuredClone(doc);
    d2.pages[0].children[0].x = 500;
    const r = await alice.json(`/api/projects/${id}`, "PATCH", { baseRevision: revision, doc: d2 });
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.revision).toBe(revision + 1);
    expect(s.snapshot).toBe(true);
    // a stale tab saving the old revision gets a conflict, not a silent overwrite
    const stale = await alice.json(`/api/projects/${id}`, "PATCH", { baseRevision: revision, doc });
    expect(stale.status).toBe(409);
    revision = s.revision;
    // second save within 10 minutes: no new automatic snapshot
    const r2 = await alice.json(`/api/projects/${id}`, "PATCH", { baseRevision: revision, title: "Poster v2" });
    revision = (await r2.json()).revision;
  });

  it("named versions and restore keep a safety copy", async () => {
    const v = await (await alice.json(`/api/projects/${id}/versions`, "POST", { label: "Approved" })).json();
    const d3 = structuredClone(doc);
    d3.pages[0].children = [];
    await alice.json(`/api/projects/${id}`, "PATCH", { baseRevision: revision, doc: d3 });
    const restored = await (await alice.json(`/api/projects/${id}/versions/${v.id}/restore`, "POST")).json();
    expect(restored.doc.pages[0].children).toHaveLength(2);
    expect(restored.doc.pages[0].children[0].x).toBe(500);
    const versions = (await (await alice.req(`/api/projects/${id}/versions`)).json()).versions;
    expect(versions.map((x: { label: string | null }) => x.label)).toEqual(expect.arrayContaining(["Approved", "Before restore", null]));
  });

  it("isolates users", async () => {
    expect((await bob.req(`/api/projects/${id}`)).status).toBe(404);
    expect((await bob.json(`/api/projects/${id}`, "PATCH", { baseRevision: 1, title: "x" })).status).toBe(404);
    expect((await bob.req(`/api/projects/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await (await bob.req("/api/projects")).json()).projects).toHaveLength(0);
  });

  it("duplicates and deletes", async () => {
    const copy = await (await alice.json(`/api/projects/${id}/duplicate`, "POST")).json();
    expect(copy.title).toBe("Poster v2 (copy)");
    expect((await alice.req(`/api/projects/${copy.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await alice.req(`/api/projects/${copy.id}`)).status).toBe(404);
  });

  it("uploads images, checks real content, serves only to the owner", async () => {
    const f = new FormData();
    f.append("file", new Blob([new Uint8Array(png(64, 40))], { type: "image/png" }), "test.png");
    const r = await alice.req("/api/assets", { method: "POST", body: f });
    expect(r.status).toBe(201);
    const a = await r.json();
    expect([a.width, a.height, a.mime]).toEqual([64, 40, "image/png"]);
    const img = await alice.req(a.url);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await img.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
    expect((await bob.req(a.url)).status).toBe(404);
    // a script renamed to .png is refused
    const fake = new FormData();
    fake.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "evil.png");
    expect((await alice.req("/api/assets", { method: "POST", body: fake })).status).toBe(400);
    // thumbnail
    const t = await alice.req(`/api/projects/${id}/thumbnail`, { method: "PUT", body: new Uint8Array(png(32, 32)) });
    expect(t.status).toBe(200);
    const list = await (await alice.req("/api/projects")).json();
    expect(list.projects[0].thumbnailAssetId).toBe((await t.json()).assetId);
  });
});
