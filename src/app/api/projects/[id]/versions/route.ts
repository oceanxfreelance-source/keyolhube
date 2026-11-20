import { z } from "zod";
import { authed, err, json, readJson } from "@/server/http";
import { createNamedVersion, listVersions } from "@/server/projects";

export const runtime = "nodejs";
type P = { id: string };

export const GET = authed<P>(async (_req, user, { id }) => {
  const v = await listVersions(user.id, id);
  return v ? json({ versions: v }) : err(404, "Project not found");
});
export const POST = authed<P>(async (req, user, { id }) => {
  const b = z.object({ label: z.string().min(1).max(100) }).safeParse(await readJson(req).catch(() => null));
  if (!b.success) return err(400, "A version name is required");
  const v = await createNamedVersion(user.id, id, b.data.label);
  return v ? json(v, 201) : err(404, "Project not found");
});
