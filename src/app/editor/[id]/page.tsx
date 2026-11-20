import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EditorLoader } from "@/components/editor/EditorLoader";
import { currentUser } from "@/server/auth";
import { getProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(await headers());
  if (!user) redirect("/sign-in");
  const p = await getProject(user.id, (await params).id);
  if (!p) notFound();
  return <EditorLoader project={{ id: p.id, title: p.title, doc: p.doc, revision: p.revision }} />;
}
