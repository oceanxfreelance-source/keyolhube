import { authed, err, json } from "@/server/http";
import { getVersion } from "@/server/projects";

export const runtime = "nodejs";
export const GET = authed<{ id: string; vid: string }>(async (_req, user, { id, vid }) => {
  const v = await getVersion(user.id, id, vid);
  return v ? json({ id: v.id, label: v.label, revision: v.revision, createdAt: v.createdAt.toISOString(), doc: v.doc }) : err(404, "Version not found");
});
