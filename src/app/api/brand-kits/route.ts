import { brandInput, createBrandKit, listBrandKits } from "@/server/brand";
import { authed, err, json, readJson } from "@/server/http";

export const runtime = "nodejs";
export const GET = authed(async (_req, user) => json({ kits: await listBrandKits(user.id) }));
export const POST = authed(async (req, user) => {
  const b = brandInput.safeParse(await readJson(req).catch(() => null));
  if (!b.success) return err(400, "Invalid brand kit");
  const k = await createBrandKit(user.id, b.data);
  return k ? json(k, 201) : err(400, "Logos must be your own uploaded images");
});
