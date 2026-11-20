import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser(await headers());
  if (!user) redirect("/sign-in");
  return <Dashboard user={user} />;
}
