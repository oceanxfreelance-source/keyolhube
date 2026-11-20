import "server-only";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DesignDoc } from "@/lib/doc/types";
import { getDb, schema } from "./db";

const { project, projectVersion } = schema;
/** An automatic snapshot is kept when the last one is older than this. */
export const AUTO_SNAPSHOT_MS = 10 * 60 * 1000;
export const MAX_AUTO_SNAPSHOTS = 50;

export type ProjectSummary = {
  id: string; title: string; kind: string; width: number; height: number; pages: number;
  thumbnailAssetId: string | null; updatedAt: string; createdAt: string;
};

function summary(p: typeof project.$inferSelect): ProjectSummary {
  return {
    id: p.id, title: p.title, kind: p.kind, width: p.doc.width, height: p.doc.height, pages: p.doc.pages.length,
    thumbnailAssetId: p.thumbnailAssetId, updatedAt: p.updatedAt.toISOString(), createdAt: p.createdAt.toISOString(),
  };
}

export async function listProjects(ownerId: string, q?: string): Promise<ProjectSummary[]> {
  const db = await getDb();
  const where = q?.trim()
    ? and(eq(project.ownerId, ownerId), ilike(project.title, `%${q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%`))
    : eq(project.ownerId, ownerId);
  const rows = await db.select().from(project).where(where).orderBy(desc(project.updatedAt)).limit(500);
  return rows.map(summary);
}

export async function createProject(ownerId: string, title: string, doc: DesignDoc, kind = "design") {
  const db = await getDb();
  const id = nanoid(12);
  const [row] = await db.insert(project).values({ id, ownerId, title: title.slice(0, 200) || "Untitled design", kind, doc }).returning();
  return { ...summary(row), doc: row.doc, revision: row.revision };
}

export async function getProject(ownerId: string, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId)));
  return row ? { ...summary(row), doc: row.doc, revision: row.revision } : null;
}

export type SaveResult =
  | { status: "saved"; revision: number; snapshot: boolean }
  | { status: "conflict"; revision: number }
  | { status: "not_found" };

/**
 * Save the document if the client edited the latest revision (optimistic concurrency).
 * Keeps an automatic version snapshot every AUTO_SNAPSHOT_MS.
 */
export async function saveProject(ownerId: string, id: string, input: { doc?: DesignDoc; title?: string; baseRevision: number }): Promise<SaveResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId))).for("update");
    if (!cur) return { status: "not_found" } as const;
    if (cur.revision !== input.baseRevision) return { status: "conflict", revision: cur.revision } as const;
    const next = cur.revision + 1;
    await tx.update(project).set({
      ...(input.doc ? { doc: input.doc } : {}),
      ...(input.title !== undefined ? { title: input.title.slice(0, 200) || "Untitled design" } : {}),
      revision: next, updatedAt: new Date(),
    }).where(eq(project.id, id));
    let snapshot = false;
    if (input.doc) {
      const [last] = await tx.select({ createdAt: projectVersion.createdAt }).from(projectVersion)
        .where(and(eq(projectVersion.projectId, id), sql`${projectVersion.label} is null`))
        .orderBy(desc(projectVersion.createdAt)).limit(1);
      if (!last || Date.now() - last.createdAt.getTime() >= AUTO_SNAPSHOT_MS) {
        await tx.insert(projectVersion).values({ id: nanoid(12), projectId: id, revision: next, label: null, doc: input.doc });
        snapshot = true;
        // Keep the newest MAX_AUTO_SNAPSHOTS automatic snapshots; named versions are kept forever.
        await tx.execute(sql`delete from project_version where project_id = ${id} and label is null and id not in (
          select id from project_version where project_id = ${id} and label is null order by created_at desc limit ${MAX_AUTO_SNAPSHOTS})`);
      }
    }
    return { status: "saved", revision: next, snapshot } as const;
  });
}

export async function listVersions(ownerId: string, id: string) {
  const db = await getDb();
  if (!(await owns(ownerId, id))) return null;
  const rows = await db.select({ id: projectVersion.id, revision: projectVersion.revision, label: projectVersion.label, createdAt: projectVersion.createdAt })
    .from(projectVersion).where(eq(projectVersion.projectId, id)).orderBy(desc(projectVersion.createdAt)).limit(200);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getVersion(ownerId: string, id: string, versionId: string) {
  const db = await getDb();
  if (!(await owns(ownerId, id))) return null;
  const [v] = await db.select().from(projectVersion).where(and(eq(projectVersion.id, versionId), eq(projectVersion.projectId, id)));
  return v ?? null;
}

/** Save the current state as a named version. */
export async function createNamedVersion(ownerId: string, id: string, label: string) {
  const db = await getDb();
  const p = await getProject(ownerId, id);
  if (!p) return null;
  const [v] = await db.insert(projectVersion).values({ id: nanoid(12), projectId: id, revision: p.revision, label: label.slice(0, 100) || "Saved version", doc: p.doc }).returning();
  return { id: v.id, revision: v.revision, label: v.label, createdAt: v.createdAt.toISOString() };
}

/** Restore a version: the current state is kept as a named version first, so nothing is lost. */
export async function restoreVersion(ownerId: string, id: string, versionId: string) {
  const v = await getVersion(ownerId, id, versionId);
  if (!v) return null;
  await createNamedVersion(ownerId, id, "Before restore");
  const db = await getDb();
  const [row] = await db.update(project).set({ doc: v.doc, revision: sql`${project.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(project.id, id), eq(project.ownerId, ownerId))).returning();
  return { doc: row.doc, revision: row.revision };
}

export async function deleteProject(ownerId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.delete(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId))).returning({ id: project.id });
  return r.length > 0;
}

export async function duplicateProject(ownerId: string, id: string) {
  const p = await getProject(ownerId, id);
  if (!p) return null;
  return createProject(ownerId, `${p.title} (copy)`, p.doc, p.kind);
}

export async function setThumbnail(ownerId: string, id: string, assetId: string) {
  const db = await getDb();
  const [old] = await db.select({ t: project.thumbnailAssetId }).from(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId)));
  if (!old) return false;
  await db.update(project).set({ thumbnailAssetId: assetId }).where(eq(project.id, id));
  if (old.t && old.t !== assetId) await db.delete(schema.asset).where(and(eq(schema.asset.id, old.t), eq(schema.asset.ownerId, ownerId)));
  return true;
}

async function owns(ownerId: string, id: string) {
  const db = await getDb();
  const [r] = await db.select({ id: project.id }).from(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId)));
  return !!r;
}
