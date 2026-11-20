import { z } from "zod";
import { parseDoc } from "@/lib/doc/validate";
import { copyAsset, createTemplate, listTemplates } from "@/server/brand";
import { authed, err, json, readJson } from "@/server/http";
import { getProject } from "@/server/projects";

export const runtime = "nodejs";
export const GET = authed(async (_req, user) => json({ templates: await listTemplates(user.id) }));

/** Save one of your designs as a template (copy of its current saved state). */
const body = z.object({ projectId: z.string().max(40), title: z.string().min(1).max(200), category: z.string().max(60).optional() });
export const POST = authed(async (req, user) => {
  const b = body.safeParse(await readJson(req).catch(() => null));
  if (!b.success) return err(400, "Invalid request");
  const p = await getProject(user.id, b.data.projectId);
  if (!p) return err(404, "Project not found");
  const d = parseDoc(p.doc);
  if (!d.ok) return err(400, d.error);
  const thumb = p.thumbnailAssetId ? await copyAsset(user.id, p.thumbnailAssetId) : null;
  return json(await createTemplate(user.id, b.data.title, b.data.category ?? "My templates", d.doc, thumb), 201);
});
