import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return toNextJsHandler(await getAuth()).GET(req);
}
export async function POST(req: Request) {
  return toNextJsHandler(await getAuth()).POST(req);
}
