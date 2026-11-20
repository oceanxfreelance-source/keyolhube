"use client";
import { useEffect, useState } from "react";
import type { DesignDoc } from "@/lib/doc/types";
import { useEditorCtx } from "./context";
import { Dialog } from "./Dialog";

type V = { id: string; revision: number; label: string | null; createdAt: string };

export function VersionsDialog({ onClose, onRestored }: { onClose: () => void; onRestored: (doc: DesignDoc, revision: number) => void }) {
  const { project } = useEditorCtx();
  const [versions, setVersions] = useState<V[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch(`/api/projects/${project.id}/versions`).then((r) => r.json()).then((b) => setVersions(b.versions)).catch(() => setError("Could not load versions"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNamed() {
    if (!label.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/projects/${project.id}/versions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: label.trim() }) });
    setBusy(false);
    if (!r.ok) return setError("Could not save the version");
    setLabel("");
    load();
  }
  async function restore(v: V) {
    if (!confirm(`Restore "${v.label ?? "Autosave"}" from ${new Date(v.createdAt).toLocaleString()}? Your current design is kept as a version named "Before restore".`)) return;
    setBusy(true);
    const r = await fetch(`/api/projects/${project.id}/versions/${v.id}/restore`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError("Restore failed");
    const b = await r.json();
    onRestored(b.doc, b.revision);
  }

  return (
    <Dialog title="Version history" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input className="input" placeholder="Name this version, e.g. Approved by client" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Version name"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveNamed(); }} />
          <button className="btn btn-primary" disabled={busy || !label.trim()} onClick={saveNamed}>Save</button>
        </div>
        <p className="text-xs text-muted">The latest saved state is what gets named. Autosaves are kept every 10 minutes while you work (newest 50); named versions are kept forever.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {versions === null ? <p className="text-sm text-muted">Loading…</p> : versions.length === 0 ? <p className="text-sm text-muted">No versions yet.</p> : (
          <ul className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{v.label ?? "Autosave"}</div>
                  <div className="text-xs text-muted">{new Date(v.createdAt).toLocaleString()}</div>
                </div>
                <button className="btn" disabled={busy} onClick={() => restore(v)}>Restore</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
