import "server-only";
import { NextResponse } from "next/server";
import { currentUser, type SessionUser } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (status: number, message: string) => NextResponse.json({ error: message }, { status });

type Ctx<P> = { params: Promise<P> };
/** Wrap a route handler: requires a signed-in user and turns thrown errors into JSON. */
export function authed<P = Record<string, never>>(fn: (req: Request, user: SessionUser, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    const user = await currentUser(req.headers);
    if (!user) return err(401, "Sign in required");
    try {
      return await fn(req, user, (await ctx?.params) ?? ({} as P));
    } catch (e) {
      console.error(e);
      return err(500, "Something went wrong on the server");
    }
  };
}

export async function readJson(req: Request, maxBytes = 8 * 1024 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too large");
  return JSON.parse(text);
}
