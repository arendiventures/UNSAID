import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { ASSET_KINDS, assets, type Asset, type AssetKind } from "@/lib/db/schema";
import { storageDir } from "@/lib/config/env";
import { newId, nowIso } from "@/lib/ids";

export const ALLOWED_ASSET_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

export function isAssetKind(k: string): k is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(k);
}

function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function registerAsset(
  db: Db,
  input: { kind: AssetKind; data: Buffer; filename: string; mimeType: string; label?: string; guestId?: string | null; episodeId?: string | null; notes?: string; approvalStatus?: Asset["approvalStatus"] },
): Asset {
  const ext = ALLOWED_ASSET_MIME[input.mimeType];
  if (!ext) throw new Error(`Unsupported asset type: ${input.mimeType}`);
  const id = newId("ast");
  const dir = path.join(storageDir(), "assets");
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join("assets", `${id}${ext}`);
  fs.writeFileSync(path.join(storageDir(), rel), input.data, { mode: 0o600 });
  const dims = input.mimeType === "image/png" ? pngDimensions(input.data) : null;
  db.insert(assets)
    .values({
      id,
      kind: input.kind,
      guestId: input.guestId ?? null,
      episodeId: input.episodeId ?? null,
      label: input.label ?? "",
      originalFilename: input.filename,
      mimeType: input.mimeType,
      size: input.data.length,
      path: rel,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      approvalStatus: input.approvalStatus ?? "pending",
      notes: input.notes ?? "",
      createdAt: nowIso(),
    })
    .run();
  return db.select().from(assets).where(eq(assets.id, id)).get()!;
}

export function listAssets(db: Db): Asset[] {
  return db.select().from(assets).orderBy(desc(assets.createdAt)).all();
}

export function getAsset(db: Db, id: string): Asset | undefined {
  return db.select().from(assets).where(eq(assets.id, id)).get();
}

export function assetAbsolutePath(a: Asset): string | null {
  const abs = path.resolve(storageDir(), a.path);
  if (!abs.startsWith(storageDir())) return null;
  return fs.existsSync(abs) ? abs : null;
}

export function deleteAsset(db: Db, id: string): boolean {
  const a = getAsset(db, id);
  if (!a) return false;
  const abs = assetAbsolutePath(a);
  db.delete(assets).where(eq(assets.id, id)).run();
  if (abs) fs.unlinkSync(abs);
  return true;
}

/** Latest approved-or-pending asset of a kind (brand assets are global; guest assets are per guest). */
export function findAsset(db: Db, kind: AssetKind, guestId?: string | null): Asset | undefined {
  const all = listAssets(db).filter((a) => a.kind === kind && a.approvalStatus !== "rejected");
  if (guestId) return all.find((a) => a.guestId === guestId);
  return all[0];
}

export function setAssetApproval(db: Db, id: string, status: Asset["approvalStatus"], notes?: string): Asset | undefined {
  db.update(assets)
    .set({ approvalStatus: status, ...(notes !== undefined ? { notes } : {}) })
    .where(eq(assets.id, id))
    .run();
  return getAsset(db, id);
}
