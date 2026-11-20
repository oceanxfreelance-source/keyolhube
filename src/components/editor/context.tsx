"use client";
import Konva from "konva";
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createStore } from "zustand/vanilla";
import { locate } from "@/lib/doc/geometry";
import type { DesignNode, Page, TextNode } from "@/lib/doc/types";
import { measureTextHeight } from "@/lib/editor/render";
import type { EditorActions, EditorState, EditorStore } from "@/lib/editor/store";

export type Tool = "select" | "hand" | "pen";
export type LeftTab = "elements" | "text" | "uploads" | "pages" | "layers";

export interface UiState {
  zoom: number;
  panX: number;
  panY: number;
  tool: Tool;
  pro: boolean; // advanced mode shows more controls
  showGrid: boolean;
  showRulers: boolean;
  gridSize: number;
  editingTextId: string | null;
  leftTab: LeftTab | null;
  /** Bumped to ask the canvas to fit the page to the screen. */
  fitRequest: number;
  stage: Konva.Stage | null;
  /** Temporarily show images without their adjustments (before/after). */
  showOriginal: boolean;
  /** Path whose anchor points are being edited. */
  editingPathId: string | null;
}

export function createUiStore() {
  let pro = false;
  try { pro = localStorage.getItem("pro") === "1"; } catch {}
  return createStore<UiState & { set: (p: Partial<UiState>) => void }>()((set) => ({
    zoom: 1, panX: 0, panY: 0, tool: "select", pro, showGrid: false, showRulers: pro, gridSize: 50,
    editingTextId: null, leftTab: "elements", fitRequest: 0, stage: null, showOriginal: false, editingPathId: null,
    set: (p) => set(p),
  }));
}
export type UiStore = ReturnType<typeof createUiStore>;

export type ProjectMeta = { id: string; title: string };
type Ctx = { store: EditorStore; ui: UiStore; project: ProjectMeta };
const EditorContext = createContext<Ctx | null>(null);
export const EditorProvider = EditorContext.Provider;

export function useEditorCtx(): Ctx {
  const c = useContext(EditorContext);
  if (!c) throw new Error("Editor context missing");
  return c;
}
// Selectors may return fresh objects/arrays: compare them shallowly to avoid render loops.
export function useEd<T>(sel: (s: EditorState & EditorActions) => T): T {
  return useStore(useEditorCtx().store, useShallow(sel));
}
export function useUi<T>(sel: (s: UiState & { set: (p: Partial<UiState>) => void }) => T): T {
  return useStore(useEditorCtx().ui, useShallow(sel));
}

export function activePage(s: EditorState): Page {
  return s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
}

export function selectedNodes(s: EditorState): DesignNode[] {
  const page = activePage(s);
  return s.selection.map((id) => locate(page, id)?.node).filter((n): n is DesignNode => !!n);
}

/** Keep a text node's stored height equal to what its content needs (call after edits). */
export function fitText(n: TextNode): void {
  n.height = measureTextHeight(Konva, n);
}
