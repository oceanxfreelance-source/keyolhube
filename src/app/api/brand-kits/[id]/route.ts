import { brandInput, deleteBrandKit, updateBrandKit } from "@/server/brand";
import { authed, err, json, readJson } from "@/server/http";

export const runtime = "nodejs";
type P = { id: string };
export const PATCH = authed<P>(async (req, user, { id }) => {
  const b = brandInput.partial().safeParse(await readJson(req).catch(() => null));
  if (!b.success) return err(400, "Invalid brand kit");
  const k = await updateBrandKit(user.id, id, b.data);
  if (k === "bad_asset") return err(400, "Logos must be your own uploaded images");
  return k ? json(k) : err(404, "Brand kit not found");
});
export const DELETE = authed<P>(async (_req, user, { id }) => ((await deleteBrandKit(user.id, id)) ? json({ ok: true }) : err(404, "Brand kit not found")));
