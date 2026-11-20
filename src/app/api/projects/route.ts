import { z } from "zod";
import { parseDoc } from "@/lib/doc/validate";
import { authed, err, json, readJson } from "@/server/http";
import { createProject, listProjects } from "@/server/projects";

export const runtime = "nodejs";

export const GET = authed(async (req, user) => {
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return json({ projects: await listProjects(user.id, q) });
});

const body = z.object({ title: z.string().max(200), kind: z.string().max(40).optional(), doc: z.unknown() });
export const POST = authed(async (req, user) => {
  const b = body.safeParse(await readJson(req).catch(() => null));
  if (!b.success) return err(400, "Invalid request");
  const d = parseDoc(b.data.doc);
  if (!d.ok) return err(400, `Invalid design: ${d.error}`);
  return json(await createProject(user.id, b.data.title, d.doc, b.data.kind), 201);
});
