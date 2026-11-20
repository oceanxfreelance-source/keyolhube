import { deleteTemplate } from "@/server/brand";
import { authed, err, json } from "@/server/http";

export const runtime = "nodejs";
export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => ((await deleteTemplate(user.id, id)) ? json({ ok: true }) : err(404, "Template not found")));
