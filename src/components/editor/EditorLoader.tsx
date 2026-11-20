"use client";
import dynamic from "next/dynamic";
import type { LoadedProject } from "./Editor";

// The editor uses the browser canvas, so it is rendered on the client only.
const Editor = dynamic(() => import("./Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => <div className="h-dvh grid place-items-center text-muted text-sm">Opening editor…</div>,
});

export function EditorLoader({ project }: { project: LoadedProject }) {
  return <Editor project={project} />;
}
