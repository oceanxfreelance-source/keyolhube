import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser(await headers());
  redirect(user ? "/dashboard" : "/sign-in");
}
