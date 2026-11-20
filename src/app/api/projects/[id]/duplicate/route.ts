import { authed, err, json } from "@/server/http";
import { duplicateProject } from "@/server/projects";

export const runtime = "nodejs";
export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const p = await duplicateProject(user.id, id);
  return p ? json(p, 201) : err(404, "Project not found");
});
