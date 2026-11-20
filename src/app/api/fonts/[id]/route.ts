import { authed, err, json } from "@/server/http";
import { deleteAsset, getAsset } from "@/server/storage";

export const runtime = "nodejs";
export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const a = await getAsset(user.id, id);
  if (!a || a.kind !== "font") return err(404, "Font not found");
  await deleteAsset(user.id, id);
  return json({ ok: true });
});
