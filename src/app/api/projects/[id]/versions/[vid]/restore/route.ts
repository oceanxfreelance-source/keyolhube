import { authed, err, json } from "@/server/http";
import { restoreVersion } from "@/server/projects";

export const runtime = "nodejs";
export const POST = authed<{ id: string; vid: string }>(async (_req, user, { id, vid }) => {
  const r = await restoreVersion(user.id, id, vid);
  return r ? json(r) : err(404, "Version not found");
});
