/**
 * Registers supplied brand/guest images into private storage.
 * Usage: pnpm assets:import <kind> <file> [--guest <slug>] [--label "text"]
 * kinds: brand_logo | studio_backdrop | guest_concept_image | episode_thumbnail
 */
import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "../src/lib/db/client";
import { isAssetKind, registerAsset } from "../src/lib/services/assets";
import { getGuest } from "../src/lib/services/guests";

const [kind, file, ...rest] = process.argv.slice(2);
if (!kind || !file || !isAssetKind(kind)) {
  console.error("usage: pnpm assets:import <brand_logo|studio_backdrop|guest_concept_image|episode_thumbnail> <file> [--guest <slug>] [--label text]");
  process.exit(1);
}
const opt = (flag: string) => {
  const i = rest.indexOf(flag);
  return i >= 0 ? rest[i + 1] : undefined;
};
const data = fs.readFileSync(file);
const ext = path.extname(file).toLowerCase();
const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : null;
if (!mime) {
  console.error("Only png/jpg/webp are accepted.");
  process.exit(1);
}
const { db, sqlite } = openDatabase();
const guestSlug = opt("--guest");
const guest = guestSlug ? getGuest(db, guestSlug) : undefined;
if (guestSlug && !guest) {
  console.error(`Guest not found: ${guestSlug}`);
  process.exit(1);
}
const asset = registerAsset(db, { kind, data, filename: path.basename(file), mimeType: mime, label: opt("--label") ?? "", guestId: guest?.id ?? null, approvalStatus: "approved", notes: "Supplied by producer" });
console.log(`+ ${asset.kind} ${asset.id} (${asset.width ?? "?"}x${asset.height ?? "?"}, ${asset.size} bytes)${guest ? ` for ${guest.displayName}` : ""}`);
sqlite.close();
