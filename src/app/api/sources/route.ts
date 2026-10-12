import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { SOURCE_TYPES, sources } from "@/lib/db/schema";
import { appConfig } from "@/lib/config/env";
import { fail, ok, readJson, route } from "@/lib/api";
import { detectUploadKind, ingestManualRecord, ingestPdf, ingestText, type SourceMetadata } from "@/lib/research/ingest";
import { getGuest } from "@/lib/services/guests";

const MetaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  authorOrg: z.string().max(300).optional(),
  publishedAt: z.string().max(60).optional(),
  url: z.string().max(2000).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  locator: z.string().max(200).optional(),
  summary: z.string().max(4000).optional(),
  provenanceNotes: z.string().max(4000).optional(),
  permissionNotes: z.string().max(4000).optional(),
  isPublic: z.boolean().optional(),
});
const ManualSchema = MetaSchema.extend({ guestId: z.string().min(1), excerpt: z.string().min(1).max(200_000) });

export const GET = route(async (req: Request) => {
  const guestId = new URL(req.url).searchParams.get("guestId");
  const db = getDb();
  const rows = guestId ? db.select().from(sources).where(eq(sources.guestId, guestId)).orderBy(desc(sources.createdAt)).all() : db.select().from(sources).orderBy(desc(sources.createdAt)).all();
  return ok(rows);
});

export const POST = route(async (req: Request) => {
  const db = getDb();
  const ct = req.headers.get("content-type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file uploaded.");
    if (file.size === 0) return fail("Uploaded file is empty.");
    if (file.size > appConfig.maxUploadBytes) return fail(`File exceeds the ${Math.round(appConfig.maxUploadBytes / 1024 / 1024)} MB upload limit (UNSAID_MAX_UPLOAD_MB).`, 413);
    const kind = detectUploadKind(file.name, file.type);
    if (!kind) return fail("Unsupported file type. Accepted: .txt, .md, .pdf (text-based).", 415);
    const guestId = String(form.get("guestId") ?? "");
    if (!getGuest(db, guestId)) return fail("Guest not found", 404);
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() ? v : undefined;
    };
    const meta = MetaSchema.parse({
      title: str("title") ?? file.name,
      authorOrg: str("authorOrg"),
      publishedAt: str("publishedAt"),
      url: str("url"),
      sourceType: str("sourceType"),
      locator: str("locator"),
      summary: str("summary"),
      provenanceNotes: str("provenanceNotes"),
      permissionNotes: str("permissionNotes"),
      isPublic: form.get("isPublic") === null ? undefined : form.get("isPublic") === "true",
    }) satisfies SourceMetadata;
    const data = Buffer.from(await file.arrayBuffer());
    const payload = { filename: file.name, mime: file.type || (kind === "pdf" ? "application/pdf" : kind === "markdown" ? "text/markdown" : "text/plain"), data };
    const out = kind === "pdf" ? await ingestPdf(db, guestId, meta, payload) : ingestText(db, guestId, meta, data.toString("utf8"), payload);
    return ok(out, { status: 201 });
  }
  const body = await readJson(req, ManualSchema);
  if (!getGuest(db, body.guestId)) return fail("Guest not found", 404);
  const { guestId, excerpt, ...meta } = body;
  return ok(ingestManualRecord(db, guestId, { ...meta, excerpt }), { status: 201 });
});
