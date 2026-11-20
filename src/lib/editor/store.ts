import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from "immer";
import { createStore } from "zustand/vanilla";
import type { DesignDoc, Page } from "../doc/types";

enablePatches();

type Entry = { label: string; patches: Patch[]; inverse: Patch[]; mergeKey?: string; at: number };

export interface EditorState {
  doc: DesignDoc;
  pageId: string;
  selection: string[];
  past: Entry[];
  future: Entry[];
  /** Increments on every document change (including undo/redo); autosave watches it. */
  revision: number;
}

export interface EditorActions {
  load(doc: DesignDoc): void;
  /** Apply a change to the document as one undoable step. Same `merge` key within 1 s = one step. */
  change(label: string, recipe: (d: Draft<DesignDoc>) => void, opts?: { merge?: string }): void;
  /** Same as change, but the recipe gets the active page. */
  changePage(label: string, recipe: (p: Draft<Page>) => void, opts?: { merge?: string }): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  setPage(id: string): void;
  page(): Page;
}

export type EditorStore = ReturnType<typeof createEditorStore>;
const HISTORY_LIMIT = 200;
const MERGE_MS = 1000;

export function createEditorStore(doc: DesignDoc) {
  return createStore<EditorState & EditorActions>()((set, get) => ({
    doc,
    pageId: doc.pages[0].id,
    selection: [],
    past: [],
    future: [],
    revision: 0,

    load(d) {
      set({ doc: d, pageId: d.pages[0].id, selection: [], past: [], future: [], revision: 0 });
    },

    change(label, recipe, opts) {
      const { doc: cur, past, revision } = get();
      const [next, patches, inverse] = produceWithPatches(cur, recipe);
      if (!patches.length) return;
      const now = Date.now();
      const last = past[past.length - 1];
      let nextPast: Entry[];
      if (opts?.merge && last && last.mergeKey === opts.merge && now - last.at < MERGE_MS) {
        // Coalesce (e.g. dragging a slider): keep the first inverse, extend the forward patches.
        nextPast = [...past.slice(0, -1), { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now }];
      } else {
        nextPast = [...past, { label, patches, inverse, mergeKey: opts?.merge, at: now }].slice(-HISTORY_LIMIT);
      }
      const pageId = keepPage(cur, next, get().pageId);
      set({ doc: next, past: nextPast, future: [], revision: revision + 1, pageId, selection: validSelection(next, pageId, get().selection) });
    },

    changePage(label, recipe, opts) {
      const pid = get().pageId;
      get().change(label, (d) => {
        const p = d.pages.find((x) => x.id === pid);
        if (p) recipe(p);
      }, opts);
    },

    undo() {
      const { past, future, doc: cur, revision } = get();
      const e = past[past.length - 1];
      if (!e) return;
      const next = applyPatches(cur, e.inverse);
      const pageId = keepPage(cur, next, get().pageId);
      set({ doc: next, past: past.slice(0, -1), future: [...future, e], revision: revision + 1, pageId, selection: validSelection(next, pageId, get().selection) });
    },

    redo() {
      const { past, future, doc: cur, revision } = get();
      const e = future[future.length - 1];
      if (!e) return;
      const next = applyPatches(cur, e.patches);
      const pageId = keepPage(cur, next, get().pageId);
      set({ doc: next, past: [...past, e], future: future.slice(0, -1), revision: revision + 1, pageId, selection: validSelection(next, pageId, get().selection) });
    },

    select(ids) {
      set({ selection: ids });
    },

    setPage(id) {
      if (get().doc.pages.some((p) => p.id === id)) set({ pageId: id, selection: [] });
    },

    page() {
      const { doc: d, pageId } = get();
      return d.pages.find((p) => p.id === pageId) ?? d.pages[0];
    },
  }));
}

/** If the active page was removed, move to the page that took its place (or the last one). */
function keepPage(prev: DesignDoc, next: DesignDoc, pageId: string): string {
  if (next.pages.some((p) => p.id === pageId)) return pageId;
  const i = prev.pages.findIndex((p) => p.id === pageId);
  return next.pages[Math.min(Math.max(i, 0), next.pages.length - 1)].id;
}

/** Drop selected ids that no longer exist on the active page (after delete, undo, etc.). */
function validSelection(doc: DesignDoc, pageId: string, sel: string[]): string[] {
  if (!sel.length) return sel;
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const ids = new Set<string>();
  const walk = (list: Page["children"]) => list.forEach((n) => { ids.add(n.id); if (n.type === "group") walk(n.children); });
  walk(page.children);
  const kept = sel.filter((id) => ids.has(id));
  return kept.length === sel.length ? sel : kept;
}
