"use client";
import { isTypingTarget } from "@/lib/editor/keys";
import { useEffect } from "react";
import { make } from "@/lib/doc/factory";
import { locate } from "@/lib/doc/geometry";
import { cloneWithNewIds, duplicateNodes, groupNodes, removeNodes, reorder, translateInPage, ungroup } from "@/lib/doc/ops";
import type { DesignNode, Page } from "@/lib/doc/types";
import { activePage, useEditorCtx } from "./context";
import { uploadImage, useAddImage } from "./useUploads";

const CLIP_KEY = "oceanx-clipboard";

export function useShortcuts() {
  const { store, ui } = useEditorCtx();
  const addImage = useAddImage();

  useEffect(() => {
    const isField = isTypingTarget;
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      const s = store.getState(), u = ui.getState();
      const mod = e.metaKey || e.ctrlKey;
      const sel = s.selection;
      const k = e.key.toLowerCase();
      const run = (fn: () => void) => { e.preventDefault(); fn(); };

      if (mod && k === "z") return run(() => (e.shiftKey ? s.redo() : s.undo()));
      if (mod && k === "y") return run(() => s.redo());
      if (mod && k === "a") return run(() => s.select(activePage(s).children.filter((n) => !n.locked && n.visible).map((n) => n.id)));
      if (mod && (k === "=" || k === "+")) return run(() => u.set({ zoom: Math.min(16, u.zoom * 1.2) }));
      if (mod && k === "-") return run(() => u.set({ zoom: Math.max(0.02, u.zoom / 1.2) }));
      if (mod && k === "0") return run(() => u.set({ fitRequest: u.fitRequest + 1 }));
      if (k === "escape") return run(() => { s.select([]); u.set({ editingTextId: null }); });
      if (k === "h" && !mod) return run(() => u.set({ tool: u.tool === "hand" ? "select" : "hand" }));
      if (k === "v" && !mod) return run(() => u.set({ tool: "select" }));
      if (k === "p" && !mod) return run(() => u.set({ tool: "pen", editingPathId: null }));
      if (k === "t" && !mod) return run(() => {
        const n = make.text(0, 0, "Add text", Math.round(s.doc.width / 20), Math.round(s.doc.width * 0.5));
        n.x = Math.round(s.doc.width / 2 - n.width / 2); n.y = Math.round(s.doc.height / 2 - n.height / 2);
        s.changePage("Add text", (p) => { p.children.push(n); });
        s.select([n.id]);
        u.set({ editingTextId: n.id });
      });
      if (!sel.length) return;

      if (k === "delete" || k === "backspace") return run(() => s.changePage("Delete", (p) => removeNodes(p as Page, sel)));
      if (mod && k === "d") return run(() => { let ids: string[] = []; s.changePage("Duplicate", (p) => { ids = duplicateNodes(p as Page, sel); }); s.select(ids); });
      if (mod && k === "g" && !e.shiftKey) return run(() => { let g: string | null = null; s.changePage("Group", (p) => { g = groupNodes(p as Page, sel); }); if (g) s.select([g]); });
      if (mod && k === "g" && e.shiftKey) return run(regroupSelect);
      if (mod && e.key === "]") return run(() => s.changePage("Bring forward", (p) => reorder(p as Page, sel, e.shiftKey ? "front" : "forward")));
      if (mod && e.key === "[") return run(() => s.changePage("Send backward", (p) => reorder(p as Page, sel, e.shiftKey ? "back" : "backward")));
      if (k === "enter") {
        const n = locate(activePage(s), sel[0])?.node;
        if (sel.length === 1 && n?.type === "text") return run(() => u.set({ editingTextId: n.id }));
      }
      // Arrow keys on a focused slider move the slider, not the selection.
      if (e.target instanceof HTMLInputElement && e.target.type === "range" && k.startsWith("arrow")) return;
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (arrows[k]) return run(() => s.changePage("Nudge", (p) => sel.forEach((id) => translateInPage(p as Page, id, ...arrows[k])), { merge: "nudge" }));

      function regroupSelect() {
        // Ungroup every selected group and select the released children.
        const released: string[] = [];
        s.changePage("Ungroup", (p) => { for (const id of sel) released.push(...ungroup(p as Page, id)); });
        if (released.length) s.select(released);
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isField(e.target)) return;
      const s = store.getState();
      const nodes = s.selection.map((id) => locate(activePage(s), id)?.node).filter(Boolean) as DesignNode[];
      if (!nodes.length) return;
      e.preventDefault();
      const payload = JSON.stringify({ kind: "oceanx-nodes", nodes });
      try { localStorage.setItem(CLIP_KEY, payload); } catch {}
      e.clipboardData?.setData("text/plain", payload);
      if (e.type === "cut") s.changePage("Cut", (p) => removeNodes(p as Page, s.selection));
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (isField(e.target)) return;
      const s = store.getState();
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        for (const f of files) {
          try { addImage(await uploadImage(f)); } catch (err) { alert((err as Error).message); }
        }
        return;
      }
      let text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.includes("oceanx-nodes")) { try { text = localStorage.getItem(CLIP_KEY) ?? text; } catch {} }
      try {
        const data = JSON.parse(text);
        if (data?.kind !== "oceanx-nodes" || !Array.isArray(data.nodes)) throw new Error();
        e.preventDefault();
        const copies = (data.nodes as DesignNode[]).map((n) => { const c = cloneWithNewIds(n); c.x += 20; c.y += 20; return c; });
        s.changePage("Paste", (p) => { p.children.push(...copies); });
        s.select(copies.map((c) => c.id));
        try { localStorage.setItem(CLIP_KEY, JSON.stringify({ kind: "oceanx-nodes", nodes: copies })); } catch {}
      } catch {
        // Plain text from elsewhere: paste it as a text box.
        if (!text.trim() || text.length > 5000) return;
        e.preventDefault();
        const n = make.text(0, 0, text.trim(), Math.round(s.doc.width / 24), Math.round(s.doc.width * 0.6));
        n.x = Math.round(s.doc.width / 2 - n.width / 2); n.y = Math.round(s.doc.height / 2);
        s.changePage("Paste text", (p) => { p.children.push(n); });
        s.select([n.id]);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("copy", onCopy); document.removeEventListener("cut", onCopy); document.removeEventListener("paste", onPaste); };
  }, [store, ui, addImage]);
}
