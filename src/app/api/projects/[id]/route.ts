import { z } from "zod";
import { parseDoc } from "@/lib/doc/validate";
import { authed, err, json, readJson } from "@/server/http";
import { deleteProject, getProject, saveProject } from "@/server/projects";

export const runtime = "nodejs";
type P = { id: string };

export const GET = authed<P>(async (_req, user, { id }) => {
  const p = await getProject(user.id, id);
  return p ? json(p) : err(404, "Project not found");
});

const body = z.object({ baseRevision: z.number().int(), title: z.string().max(200).optional(), doc: z.unknown().optional() });
/** Autosave / rename. 409 when someone saved a newer revision (e.g. another tab). */
export const PATCH = authed<P>(async (req, user, { id }) => {
  const b = body.safeParse(await readJson(req).catch(() => null));
  if (!b.success) return err(400, "Invalid request");
  let doc;
  if (b.data.doc !== undefined) {
    const d = parseDoc(b.data.doc);
    if (!d.ok) return err(400, `Invalid design: ${d.error}`);
    doc = d.doc;
  }
  const r = await saveProject(user.id, id, { doc, title: b.data.title, baseRevision: b.data.baseRevision });
  if (r.status === "not_found") return err(404, "Project not found");
  if (r.status === "conflict") return json({ error: "This design was changed somewhere else", revision: r.revision }, 409);
  return json(r);
});

export const DELETE = authed<P>(async (_req, user, { id }) => ((await deleteProject(user.id, id)) ? json({ ok: true }) : err(404, "Project not found")));
