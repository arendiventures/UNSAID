import { getDb } from "@/lib/db/client";
import { appConfig } from "@/lib/config/env";
import { fail, ok, route } from "@/lib/api";
import { ALLOWED_ASSET_MIME, isAssetKind, listAssets, registerAsset } from "@/lib/services/assets";
import { getGuest } from "@/lib/services/guests";

export const GET = route(async () => ok(listAssets(getDb())));

export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  if (!(file instanceof File) || file.size === 0) return fail("No file uploaded.");
  if (!isAssetKind(kind)) return fail("Unknown asset kind.");
  if (!ALLOWED_ASSET_MIME[file.type]) return fail(`Unsupported media type ${file.type || "(unknown)"}. Accepted: PNG, JPEG, WebP, MP3, WAV, WebM, MP4.`, 415);
  if (file.size > appConfig.maxUploadBytes) return fail(`File exceeds the ${Math.round(appConfig.maxUploadBytes / 1024 / 1024)} MB upload limit (UNSAID_MAX_UPLOAD_MB).`, 413);
  const db = getDb();
  const guestId = String(form.get("guestId") ?? "") || null;
  if (guestId && !getGuest(db, guestId)) return fail("Guest not found", 404);
  const asset = registerAsset(db, { kind, data: Buffer.from(await file.arrayBuffer()), filename: file.name, mimeType: file.type, label: String(form.get("label") ?? ""), guestId, notes: String(form.get("notes") ?? "") });
  return ok(asset, { status: 201 });
});
